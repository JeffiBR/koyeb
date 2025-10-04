# main.py (completo e corrigido)
import os
import asyncio
from datetime import date, timedelta, datetime
import logging
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Depends, Header, Request
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from supabase import create_client, Client
from postgrest.exceptions import APIError
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import pandas as pd
import collector_service

# --------------------------------------------------------------------------
# --- 1. CONFIGURAÇÕES INICIAIS E VARIÁVEIS DE AMBIENTE ---
# --------------------------------------------------------------------------
load_dotenv()
app = FastAPI(
    title="API de Preços Arapiraca",
    description="Sistema completo para coleta e análise de preços de supermercados.",
    version="3.1.2"
)
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

# --- Carregamento e Validação das Variáveis de Ambiente ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SERVICE_ROLE_KEY = os.getenv("SERVICE_ROLE_KEY")
ECONOMIZA_ALAGOAS_TOKEN = os.getenv("ECONOMIZA_ALAGOAS_TOKEN")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:5500,http://localhost:8000").split(',')

if not all([SUPABASE_URL, SUPABASE_KEY, SERVICE_ROLE_KEY, ECONOMIZA_ALAGOAS_TOKEN]):
    logging.error("Variáveis de ambiente essenciais (SUPABASE_URL, SUPABASE_KEY, SERVICE_ROLE_KEY, ECONOMIZA_ALAGOAS_TOKEN) não estão definidas. Verifique seu arquivo .env")
    exit(1)

# --- Clientes Supabase ---
# Cliente síncrono para operações que não precisam de async
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_admin: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

# Cliente assíncrono (usaremos uma abordagem diferente)
# Para operações assíncronas, vamos usar o cliente síncrono com asyncio.to_thread

# --------------------------------------------------------------------------
# --- 2. TRATAMENTO DE ERROS CENTRALIZADO ---
# --------------------------------------------------------------------------
@app.exception_handler(APIError)
async def handle_supabase_errors(request: Request, exc: APIError):
    logging.error(f"Erro do Supabase na rota {request.url.path}: {exc.message} (Código: {exc.code})")
    return JSONResponse(
        status_code=400,
        content={"detail": f"Erro de comunicação com o banco de dados: {exc.message}"},
    )

# --------------------------------------------------------------------------
# --- 3. AUTENTICAÇÃO, AUTORIZAÇÃO E MIDDLEWARES ---
# --------------------------------------------------------------------------
class UserProfile(BaseModel):
    id: str
    role: str = "user"
    allowed_pages: List[str] = []
    email: Optional[str] = None

async def get_current_user(authorization: str = Header(None)) -> UserProfile:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autorização ausente ou mal formatado")
    jwt = authorization.split(" ")[1]
    try:
        user_response = supabase.auth.get_user(jwt)
        user = user_response.user
        user_id = user.id
        
        # Buscar o perfil completo - executar em thread separada
        profile_response = await asyncio.to_thread(
            supabase.table('profiles').select('*').eq('id', user_id).single().execute
        )
        
        if not profile_response.data:
            # Criar perfil padrão se não existir
            try:
                new_profile = {
                    'id': user_id,
                    'full_name': user.email or 'Usuário',
                    'role': 'user',
                    'allowed_pages': []  # Array vazio, não JSON
                }
                await asyncio.to_thread(
                    supabase.table('profiles').insert(new_profile).execute
                )
                profile_data = new_profile
            except Exception as e:
                logging.error(f"Erro ao criar perfil padrão: {e}")
                # Se não conseguir criar, usar valores padrão
                profile_data = {'role': 'user', 'allowed_pages': []}
        else:
            profile_data = profile_response.data
        
        # GARANTIR que role e allowed_pages sempre tenham valores
        role = profile_data.get('role', 'user')
        allowed_pages = profile_data.get('allowed_pages', [])
        
        # Se allowed_pages for None, converter para array vazio
        if allowed_pages is None:
            allowed_pages = []
        
        return UserProfile(
            id=user_id, 
            role=role,
            allowed_pages=allowed_pages,
            email=user.email
        )
    except Exception as e:
        if isinstance(e, APIError): 
            raise e
        logging.error(f"Erro de validação de token: {e}")
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

async def get_current_user_optional(authorization: str = Header(None)) -> Optional[UserProfile]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    jwt = authorization.split(" ")[1]
    try:
        user_response = supabase.auth.get_user(jwt)
        user = user_response.user
        user_id = user.id
        
        profile_response = await asyncio.to_thread(
            supabase.table('profiles').select('*').eq('id', user_id).single().execute
        )
        
        if not profile_response.data:
            return UserProfile(
                id=user_id,
                role='user',
                allowed_pages=[],
                email=user.email
            )
        
        profile_data = profile_response.data
        
        # Garantir valores não nulos
        role = profile_data.get('role', 'user')
        allowed_pages = profile_data.get('allowed_pages', [])
        
        return UserProfile(
            id=user_id, 
            role=role,
            allowed_pages=allowed_pages,
            email=user.email
        )
    except Exception as e:
        return None

def require_page_access(page_key: str):
    async def _verify_access(current_user: UserProfile = Depends(get_current_user)):
        if current_user.role != 'admin' and page_key not in current_user.allowed_pages:
            raise HTTPException(status_code=403, detail=f"Acesso negado à funcionalidade: {page_key}")
        return current_user
    return _verify_access

initial_status = {
    "status": "IDLE", "startTime": None, "progressPercent": 0, "etaSeconds": 0,
    "currentMarket": "", "totalMarkets": 0, "marketsProcessed": 0,
    "currentProduct": "", "totalProducts": 0, "productsProcessedInMarket": 0,
    "totalItemsFound": 0, "progresso": "Aguardando início", "report": None
}
collection_status: Dict[str, Any] = initial_status.copy()

app.add_middleware(
    CORSMiddleware, 
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True, 
    allow_methods=["*"], 
    allow_headers=["*"]
)

# --------------------------------------------------------------------------
# --- 4. MODELOS DE DADOS (PYDANTIC) ---
# --------------------------------------------------------------------------
class Categoria(BaseModel):
    id: Optional[int] = None
    nome: str
    palavras_chave: List[str]
    regra_unidade: Optional[str] = None

class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str
    allowed_pages: List[str] = []

class UserUpdate(BaseModel):
    full_name: str
    role: str
    allowed_pages: List[str]

class ProfileUpdateWithCredentials(BaseModel):
    full_name: Optional[str] = None
    job_title: Optional[str] = None
    avatar_url: Optional[str] = None
    email: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

    class Config:
        extra = "ignore" 
        
class Supermercado(BaseModel):
    id: Optional[int] = None
    nome: str
    cnpj: str
    endereco: Optional[str] = None

class RealtimeSearchRequest(BaseModel):
    produto: str
    cnpjs: List[str]

class PriceHistoryRequest(BaseModel):
    product_identifier: str
    cnpjs: List[str]
    end_date: date = Field(default_factory=date.today)
    start_date: date = Field(default_factory=lambda: date.today() - timedelta(days=29))

class PruneByCollectionsRequest(BaseModel):
    cnpj: str
    collection_ids: List[int]

class LogDeleteRequest(BaseModel):
    date: Optional[date] = None
    user_id: Optional[str] = None

class CustomActionRequest(BaseModel):
    action_type: str
    page: str
    details: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str

# --------------------------------------------------------------------------
# --- 5. FUNÇÕES DE LOG CORRIGIDAS ---
# --------------------------------------------------------------------------

def log_search(term: str, type: str, cnpjs: Optional[List[str]], count: int, user: Optional[UserProfile] = None):
    """Função para registrar logs de busca, rodando em background."""
    try:
        user_id = user.id if user else None
        user_name = None
        user_email = None
        
        if user_id:
            try:
                profile_response = supabase_admin.table('profiles').select('full_name').eq('id', user_id).single().execute()
                if profile_response.data:
                    user_name = profile_response.data.get('full_name')
                
                auth_response = supabase_admin.auth.admin.get_user_by_id(user_id)
                if auth_response.user:
                    user_email = auth_response.user.email
                    if not user_name:
                        user_name = user_email
            except Exception as e:
                logging.error(f"Erro ao buscar informações do usuário {user_id}: {e}")
                try:
                    auth_response = supabase_admin.auth.admin.get_user_by_id(user_id)
                    if auth_response.user:
                        user_name = auth_response.user.email
                        user_email = auth_response.user.email
                except Exception as auth_error:
                    logging.error(f"Erro ao buscar email do usuário {user_id}: {auth_error}")
        
        log_data = {
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "action_type": "search" if type == 'database' else "realtime_search",
            "search_term": term,
            "selected_markets": cnpjs if cnpjs else [],
            "result_count": count
        }
        
        supabase_admin.table('log_de_usuarios').insert(log_data).execute()
        logging.info(f"Log de busca salvo para usuário {user_id}: {term}")
        
    except Exception as e: 
        logging.error(f"Erro ao salvar log de busca: {e}")

def log_page_access(page_key: str, user: UserProfile):
    """Função para registrar o acesso à página, rodando em background."""
    try:
        user_name = None
        user_email = None
        
        if user.id:
            try:
                profile_response = supabase_admin.table('profiles').select('full_name').eq('id', user.id).single().execute()
                if profile_response.data:
                    user_name = profile_response.data.get('full_name')
                
                auth_response = supabase_admin.auth.admin.get_user_by_id(user.id)
                if auth_response.user:
                    user_email = auth_response.user.email
                    if not user_name:
                        user_name = user_email
            except Exception as e:
                logging.error(f"Erro ao buscar informações do usuário {user.id}: {e}")
        
        log_data = {
            "user_id": user.id,
            "user_name": user_name,
            "user_email": user_email,
            "action_type": "access",
            "page_accessed": page_key,
        }
        supabase_admin.table('log_de_usuarios').insert(log_data).execute()
        logging.info(f"Log de acesso salvo para usuário {user.id}: {page_key}")
    except Exception as e:
        logging.error(f"Erro ao salvar log de acesso à página {page_key} para {user.id}: {e}")

def log_custom_action_internal(request: CustomActionRequest, user: Optional[UserProfile]):
    """Função interna para registrar ações customizadas."""
    try:
        user_id = user.id if user else None
        user_name = None
        user_email = None
        
        if user_id:
            try:
                profile_response = supabase_admin.table('profiles').select('full_name').eq('id', user_id).single().execute()
                if profile_response.data:
                    user_name = profile_response.data.get('full_name')
                
                auth_response = supabase_admin.auth.admin.get_user_by_id(user_id)
                if auth_response.user:
                    user_email = auth_response.user.email
                    if not user_name:
                        user_name = user_email
            except Exception as e:
                logging.error(f"Erro ao buscar informações do usuário {user_id}: {e}")
        
        log_data = {
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "action_type": request.action_type,
            "page_accessed": request.page,
            "details": request.details,
            "created_at": request.timestamp
        }
        
        supabase_admin.table('log_de_usuarios').insert(log_data).execute()
        logging.info(f"Ação customizada registrada: {request.action_type} para usuário {user_id}")
        
    except Exception as e:
        logging.error(f"Erro ao salvar ação customizada: {e}")

# --------------------------------------------------------------------------
# --- 6. ENDPOINTS DA APLICAÇÃO ---
# --------------------------------------------------------------------------

# --- Gerenciamento de Perfil Pessoal ---
@app.get("/api/users/me")
async def get_my_profile(current_user: UserProfile = Depends(get_current_user)):
    try:
        # 1. Busca os dados do perfil (full_name, avatar_url, etc.)
        response = await asyncio.to_thread(
            supabase.table('profiles').select('*').eq('id', current_user.id).single().execute
        )
        
        profile_data = response.data
        
        # 2. Se o perfil existir, adiciona o e-mail a partir do objeto 'current_user'
        # que já recebemos da autenticação. É a forma correta e segura.
        if profile_data:
            profile_data['email'] = current_user.email
        else:
            # Se por algum motivo o perfil não for encontrado, retorna um erro.
            raise HTTPException(status_code=404, detail="Perfil do usuário não encontrado.")

        return profile_data
        
    except Exception as e:
        logging.error(f"Erro ao buscar o perfil do usuário: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao carregar o perfil do usuário.")

# VERSÃO CORRIGIDA - usando asyncio.to_thread para operações síncronas
@app.put("/api/users/me")
async def update_my_profile(profile_data: ProfileUpdateWithCredentials, current_user: UserProfile = Depends(get_current_user)):
    try:
        # 1. Começamos com um dicionário vazio para os dados do perfil
        profile_update_data = {}

        # 2. Adicionamos os campos um a um, se eles foram enviados
        if profile_data.full_name is not None:
            profile_update_data['full_name'] = profile_data.full_name
        if profile_data.job_title is not None:
            profile_update_data['job_title'] = profile_data.job_title
        
        # --- LÓGICA CRÍTICA PARA O AVATAR ---
        # Se avatar_url foi enviado no corpo da requisição, nós o usamos.
        # Isso cobre tanto a adição de uma nova foto (URL) quanto a remoção (null).
        if profile_data.avatar_url is not None or (hasattr(profile_data, 'avatar_url') and profile_data.avatar_url is None):
             profile_update_data['avatar_url'] = profile_data.avatar_url

        # 3. Lidar com alteração de e-mail e senha (lógica existente)
        if profile_data.email or profile_data.new_password:
            if not profile_data.current_password:
                raise HTTPException(status_code=400, detail="Senha atual é necessária para alterar e-mail ou senha.")
            try:
                await asyncio.to_thread(
                    lambda: supabase.auth.sign_in_with_password({
                        "email": current_user.email,
                        "password": profile_data.current_password
                    })
                )
            except Exception:
                raise HTTPException(status_code=400, detail="Senha atual incorreta.")

            if profile_data.email and profile_data.email != current_user.email:
                await asyncio.to_thread(lambda: supabase.auth.update_user({"email": profile_data.email}))
            if profile_data.new_password:
                await asyncio.to_thread(lambda: supabase.auth.update_user({"password": profile_data.new_password}))

        # 4. Atualizar dados na tabela 'profiles' se houver algo para atualizar
        if profile_update_data:
            logging.info(f"Atualizando perfil {current_user.id} com os dados: {profile_update_data}")
            response = await asyncio.to_thread(
                lambda: supabase.table('profiles').update(profile_update_data).eq('id', current_user.id).execute()
            )
            if response.data:
                return response.data[0]

        # 5. Se nada foi alterado, buscar e retornar o perfil atual
        response = await asyncio.to_thread(
            lambda: supabase.table('profiles').select('*').eq('id', current_user.id).single().execute()
        )
        return response.data

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro CRÍTICO ao atualizar perfil: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao atualizar perfil: {str(e)}")

# --- Gerenciamento de Usuários ---
@app.post("/api/users")
async def create_user(user_data: UserCreate, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        logging.info(f"Admin {admin_user.id} tentando criar usuário: {user_data.email}")
        
        # Executar em thread separada
        created_user_res = await asyncio.to_thread(
            lambda: supabase_admin.auth.admin.create_user({
                "email": user_data.email, "password": user_data.password,
                "email_confirm": True, "user_metadata": {'full_name': user_data.full_name}
            })
        )
        
        user_id = created_user_res.user.id
        logging.info(f"Usuário criado no Auth com ID: {user_id}")
        
        profile_update_response = await asyncio.to_thread(
            supabase_admin.table('profiles').update({
                'role': user_data.role, 'allowed_pages': user_data.allowed_pages
            }).eq('id', user_id).execute
        )
        
        if not profile_update_response.data:
             logging.warning(f"Usuário {user_id} foi criado no Auth, mas o perfil não foi encontrado para atualizar.")
             raise HTTPException(status_code=404, detail="Usuário criado, mas o perfil não foi encontrado para definir as permissões.")
        
        logging.info(f"Perfil do usuário {user_id} atualizado com a role: {user_data.role}")
        return {"message": "Usuário criado com sucesso"}
    except APIError as e:
        logging.error(f"Erro da API do Supabase ao criar usuário: {e}")
        raise HTTPException(status_code=400, detail=f"Erro do Supabase: {e.message}")
    except Exception as e:
        logging.error(f"Falha CRÍTICA ao criar usuário: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno inesperado no servidor.")

@app.put("/api/users/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, admin_user: UserProfile = Depends(require_page_access('users'))):
    await asyncio.to_thread(
        lambda: supabase_admin.table('profiles').update(user_data.dict()).eq('id', user_id).execute()
    )
    return {"message": "Usuário atualizado com sucesso"}
        
@app.get("/api/users")
async def list_users(admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        profiles_response = await asyncio.to_thread(
            supabase.table('profiles').select(
                'id, full_name, role, allowed_pages, avatar_url'
            ).execute
        )
        profiles = profiles_response.data or []

        users = []
        for profile in profiles:
            email = None
            try:
                auth_response = await asyncio.to_thread(
                    lambda: supabase_admin.auth.admin.get_user_by_id(profile['id'])
                )
                if auth_response.user:
                    email = auth_response.user.email
            except Exception as e:
                logging.error(f"Erro ao buscar e-mail do usuário {profile['id']}: {e}")

            users.append({
                "id": profile["id"],
                "full_name": profile.get("full_name"),
                "role": profile.get("role"),
                "allowed_pages": profile.get("allowed_pages"),
                "avatar_url": profile.get("avatar_url"),
                "email": email or "N/A"
            })

        return users

    except Exception as e:
        logging.error(f"Erro ao listar usuários: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao listar usuários")

@app.delete("/api/users/{user_id}", status_code=204)
async def delete_user(user_id: str, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        await asyncio.to_thread(
            lambda: supabase_admin.auth.admin.delete_user(user_id)
        )
        logging.info(f"Usuário com ID {user_id} foi excluído pelo admin {admin_user.id}")
        return
    except Exception as e:
        logging.error(f"Falha ao excluir usuário {user_id}: {e}")
        raise HTTPException(status_code=400, detail="Não foi possível excluir o usuário.")

# --- Gerenciamento de Categorias ---
@app.get("/api/categories", response_model=List[Categoria])
async def list_categories(user: UserProfile = Depends(get_current_user)):
    resp = await asyncio.to_thread(
        supabase.table('categorias').select('*').order('nome').execute
    )
    return resp.data

@app.post("/api/categories", response_model=Categoria)
async def create_category(categoria: Categoria, admin_user: UserProfile = Depends(require_page_access('users'))):
    resp = await asyncio.to_thread(
        supabase.table('categorias').insert(categoria.dict(exclude={'id'})).execute
    )
    return resp.data[0]

@app.put("/api/categories/{id}", response_model=Categoria)
async def update_category(id: int, categoria: Categoria, admin_user: UserProfile = Depends(require_page_access('users'))):
    resp = await asyncio.to_thread(
        supabase.table('categorias').update(categoria.dict(exclude={'id', 'created_at'})).eq('id', id).execute
    )
    if not resp.data: 
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return resp.data[0]

@app.delete("/api/categories/{id}", status_code=204)
async def delete_category(id: int, admin_user: UserProfile = Depends(require_page_access('users'))):
    await asyncio.to_thread(
        lambda: supabase.table('categorias').delete().eq('id', id).execute()
    )
    return
    
# --- Gerenciamento da Coleta ---
@app.post("/api/trigger-collection")
async def trigger_collection(background_tasks: BackgroundTasks, user: UserProfile = Depends(require_page_access('coleta'))):
    if collection_status["status"] == "RUNNING":
        raise HTTPException(status_code=409, detail="A coleta de dados já está em andamento.")
    collection_status.update(initial_status.copy())
    background_tasks.add_task(collector_service.run_full_collection, supabase_admin, ECONOMIZA_ALAGOAS_TOKEN, collection_status)
    return {"message": "Processo de coleta iniciado."}

@app.get("/api/collection-status")
async def get_collection_status(user: UserProfile = Depends(get_current_user)):
    return collection_status

# --- Gerenciamento de Supermercados ---
@app.get("/api/supermarkets", response_model=List[Supermercado])
async def list_supermarkets_admin(user: UserProfile = Depends(get_current_user)):
    resp = await asyncio.to_thread(
        supabase.table('supermercados').select('id, nome, cnpj, endereco').order('nome').execute
    )
    return resp.data

@app.post("/api/supermarkets", status_code=201, response_model=Supermercado)
async def create_supermarket(market: Supermercado, user: UserProfile = Depends(require_page_access('markets'))):
    market_data = market.dict(exclude={'id'})
    market_data = {k: v for k, v in market_data.items() if v is not None}
    
    resp = await asyncio.to_thread(
        supabase.table('supermercados').insert(market_data).execute
    )
    return resp.data[0]

@app.put("/api/supermarkets/{id}", response_model=Supermercado)
async def update_supermarket(id: int, market: Supermercado, user: UserProfile = Depends(require_page_access('markets'))):
    market_data = market.dict(exclude={'id'})
    market_data = {k: v for k, v in market_data.items() if v is not None}
    
    resp = await asyncio.to_thread(
        supabase.table('supermercados').update(market_data).eq('id', id).execute
    )
    if not resp.data: 
        raise HTTPException(status_code=404, detail="Mercado não encontrado")
    return resp.data[0]

@app.delete("/api/supermarkets/{id}", status_code=204)
async def delete_supermarket(id: int, user: UserProfile = Depends(require_page_access('markets'))):
    await asyncio.to_thread(
        lambda: supabase.table('supermercados').delete().eq('id', id).execute()
    )
    return

# --- Endpoint Público de Supermercados ---
@app.get("/api/supermarkets/public", response_model=List[Supermercado])
async def list_supermarkets_public():
    resp = await asyncio.to_thread(
        supabase.table('supermercados').select('id, nome, cnpj, endereco').order('nome').execute
    )
    return resp.data

# --- Gerenciamento de Dados Históricos ---
@app.get("/api/collections")
async def list_collections(user: UserProfile = Depends(require_page_access('collections'))):
    response = await asyncio.to_thread(
        supabase.table('coletas').select('*').order('iniciada_em', desc=True).execute
    )
    return response.data

@app.get("/api/collections/{collection_id}/details")
async def get_collection_details(collection_id: int, user: UserProfile = Depends(require_page_access('collections'))):
    response = await asyncio.to_thread(
        lambda: supabase.rpc('get_collection_details', {'p_coleta_id': collection_id}).execute()
    )
    return response.data

@app.delete("/api/collections/{collection_id}", status_code=204)
async def delete_collection(collection_id: int, user: UserProfile = Depends(require_page_access('collections'))):
    await asyncio.to_thread(
        lambda: supabase.table('coletas').delete().eq('id', collection_id).execute()
    )
    return

@app.post("/api/prune-by-collections")
async def prune_by_collections(request: PruneByCollectionsRequest, user: UserProfile = Depends(require_page_access('prune'))):
    if not request.collection_ids:
        raise HTTPException(status_code=400, detail="Pelo menos uma coleta deve ser selecionada.")
    response = await asyncio.to_thread(
        lambda: supabase.table('produtos').delete().eq('cnpj_supermercado', request.cnpj).in_('coleta_id', request.collection_ids).execute()
    )
    deleted_count = len(response.data) if response.data else 0
    logging.info(f"Limpeza de dados: {deleted_count} registros apagados para o CNPJ {request.cnpj} das coletas {request.collection_ids}.")
    return {"message": "Operação de limpeza concluída com sucesso.", "deleted_count": deleted_count}

@app.get("/api/collections-by-market/{cnpj}")
async def get_collections_by_market(cnpj: str, user: UserProfile = Depends(require_page_access('prune'))):
    response = await asyncio.to_thread(
        lambda: supabase.rpc('get_collections_for_market', {'market_cnpj': cnpj}).execute()
    )
    return response.data

# --- LOGS DE USUÁRIOS CORRIGIDOS ---
@app.get("/api/user-logs")
async def get_user_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    try:
        start_index = (page - 1) * page_size
        end_index = start_index + page_size - 1
        
        query = supabase.table('log_de_usuarios').select('*', count='exact')
        
        if user_id:
            query = query.eq('user_id', user_id)
        if date:
            query = query.gte('created_at', f'{date}T00:00:00').lte('created_at', f'{date}T23:59:59')
        if action_type:
            query = query.eq('action_type', action_type)
        
        response = await asyncio.to_thread(
            query.order('created_at', desc=True).range(start_index, end_index).execute
        )
        
        user_logs = []
        for log in response.data:
            user_logs.append({
                'id': log['id'],
                'user_id': log.get('user_id'),
                'user_name': log.get('user_name') or 'N/A',
                'user_email': log.get('user_email') or 'N/A',
                'action_type': log.get('action_type'),
                'search_term': log.get('search_term'),
                'selected_markets': log.get('selected_markets') or [],
                'result_count': log.get('result_count'),
                'page_accessed': log.get('page_accessed'),
                'created_at': log.get('created_at')
            })
        
        return {
            "data": user_logs,
            "total_count": response.count or 0,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logging.error(f"Erro ao buscar logs de usuários: {e}")
        raise HTTPException(status_code=500, detail=f"Erro interno ao buscar logs: {str(e)}")

@app.delete("/api/user-logs/{log_id}")
async def delete_single_log(log_id: int, user: UserProfile = Depends(require_page_access('user_logs'))):
    try:
        response = await asyncio.to_thread(
            lambda: supabase.table('log_de_usuarios').delete().eq('id', log_id).execute()
        )
        deleted_count = len(response.data) if response.data else 0
        return {"message": "Log excluído com sucesso", "deleted_count": deleted_count}
    except Exception as e:
        logging.error(f"Erro ao deletar log {log_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao deletar log: {str(e)}")

@app.delete("/api/user-logs")
async def delete_user_logs(
    user_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    try:
        query = supabase.table('log_de_usuarios').delete()
        
        if user_id:
            query = query.eq('user_id', user_id)
        if date:
            query = query.gte('created_at', f'{date}T00:00:00').lte('created_at', f'{date}T23:59:59')
        
        response = await asyncio.to_thread(
            query.execute
        )
        deleted_count = len(response.data) if response.data else 0
        return {"message": "Logs excluídos com sucesso", "deleted_count": deleted_count}
    except Exception as e:
        logging.error(f"Erro ao deletar logs em lote: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao deletar logs: {str(e)}")

@app.get("/api/user-logs/export")
async def export_user_logs(
    user_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    try:
        import csv
        import io
        
        query = supabase.table('log_de_usuarios').select('*')
        
        if user_id:
            query = query.eq('user_id', user_id)
        if date:
            query = query.gte('created_at', f'{date}T00:00:00').lte('created_at', f'{date}T23:59:59')
        if action_type:
            query = query.eq('action_type', action_type)
        
        response = await asyncio.to_thread(
            query.order('created_at', desc=True).execute
        )
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Nenhum log encontrado para exportação")
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(['ID', 'Usuário', 'Email', 'Ação', 'Termo Pesquisado', 'Mercados', 'Resultados', 'Página Acessada', 'Data/Hora'])
        
        for log in response.data:
            writer.writerow([
                log['id'],
                log.get('user_name', ''),
                log.get('user_email', ''),
                log.get('action_type', ''),
                log.get('search_term', ''),
                ', '.join(log.get('selected_markets', [])),
                log.get('result_count', ''),
                log.get('page_accessed', ''),
                log.get('created_at', '')
            ])
        
        content = output.getvalue()
        output.close()
        
        return Response(
            content=content,
            media_type='text/csv',
            headers={'Content-Disposition': f'attachment; filename=user_logs_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'}
        )
    except Exception as e:
        logging.error(f"Erro ao exportar logs: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao exportar logs: {str(e)}")

@app.post("/api/user-logs/delete-by-date")
async def delete_logs_by_date(
    request: LogDeleteRequest,
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    if not request.date:
        raise HTTPException(status_code=400, detail="Data é obrigatória para esta operação.")
        
    try:
        response = await asyncio.to_thread(
            lambda: supabase.table('log_de_usuarios').delete().lte('created_at', request.date.isoformat()).execute()
        )
        deleted_count = len(response.data) if response.data else 0
        return {"message": f"Logs até a data {request.date.isoformat()} deletados com sucesso.", "deleted_count": deleted_count}
    except Exception as e:
        logging.error(f"Erro ao deletar logs por data: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar logs.")

# --- NOVOS ENDPOINTS PARA MONITORAMENTO COMPLETO ---

@app.post("/api/log-page-access")
async def log_page_access_endpoint(
    request: dict,
    background_tasks: BackgroundTasks,
    current_user: UserProfile = Depends(get_current_user)
):
    page_key = request.get('page_key')
    if not page_key:
        raise HTTPException(status_code=400, detail="page_key é obrigatório")
    
    background_tasks.add_task(log_page_access, page_key, current_user)
    return {"message": "Log de acesso registrado"}

@app.post("/api/log-custom-action")
async def log_custom_action(
    request: CustomActionRequest,
    background_tasks: BackgroundTasks,
    current_user: UserProfile = Depends(get_current_user_optional)
):
    background_tasks.add_task(log_custom_action_internal, request, current_user)
    return {"message": "Ação customizada registrada"}

@app.get("/api/usage-statistics")
async def get_usage_statistics(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    try:
        page_stats_response = await asyncio.to_thread(
            lambda: supabase_admin.table('log_de_usuarios') \
                .select('page_accessed', count='exact') \
                .eq('action_type', 'access') \
                .gte('created_at', str(start_date)) \
                .lte('created_at', f'{end_date} 23:59:59') \
                .execute()
        )
        
        active_users_response = await asyncio.to_thread(
            lambda: supabase_admin.table('log_de_usuarios') \
                .select('user_id', count='exact') \
                .gte('created_at', str(start_date)) \
                .lte('created_at', f'{end_date} 23:59:59') \
                .execute()
        )
        
        top_actions_response = await asyncio.to_thread(
            lambda: supabase_admin.table('log_de_usuarios') \
                .select('action_type', count='exact') \
                .gte('created_at', str(start_date)) \
                .lte('created_at', f'{end_date} 23:59:59') \
                .execute()
        )
        
        statistics = {
            "period": {
                "start_date": str(start_date),
                "end_date": str(end_date)
            },
            "page_access": page_stats_response.count or 0,
            "active_users": active_users_response.count or 0,
            "top_actions": top_actions_response.data or []
        }
        
        return statistics
        
    except Exception as e:
        logging.error(f"Erro ao buscar estatísticas de uso: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar estatísticas de uso")

# --- Endpoints Públicos e de Usuário Logado ---
@app.get("/api/products-log")
async def get_products_log(page: int = 1, page_size: int = 50, user: UserProfile = Depends(require_page_access('product_log'))):
    start_index = (page - 1) * page_size
    end_index = start_index + page_size - 1
    response = await asyncio.to_thread(
        supabase.table('produtos').select('*', count='exact').order('created_at', desc=True).range(start_index, end_index).execute
    )
    return {"data": response.data, "total_count": response.count}

@app.get("/api/search")
async def search_products(
    q: str, 
    background_tasks: BackgroundTasks, 
    cnpjs: Optional[List[str]] = Query(None),
    current_user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    termo_busca = f"%{q.lower().strip()}%"
    query = supabase.table('produtos').select(
    '*, supermercados(endereco)'
).ilike('nome_produto_normalizado', termo_busca)
    if cnpjs: 
        query = query.in_('cnpj_supermercado', cnpjs)
    
    response = await asyncio.to_thread(
        query.limit(500).execute
    )
    
    background_tasks.add_task(log_search, q, 'database', cnpjs, len(response.data), current_user)
    
    if not response.data: 
        return {"results": []}
    
    df = pd.DataFrame(response.data)
    df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
    df.dropna(subset=['preco_produto'], inplace=True)
    
    if not df.empty:
        preco_medio = df['preco_produto'].mean()
        df['status_preco'] = df['preco_produto'].apply(
            lambda x: 'Barato' if x < preco_medio * 0.9 else ('Caro' if x > preco_medio * 1.1 else 'Na Média')
        )
    
    df = df.sort_values(by='preco_produto', ascending=True)
    results = df.head(100).to_dict(orient='records')
    return {"results": results}

@app.post("/api/realtime-search")
async def realtime_search(
    request: RealtimeSearchRequest, 
    background_tasks: BackgroundTasks, 
    current_user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if not request.cnpjs: 
        raise HTTPException(status_code=400, detail="Pelo menos um CNPJ deve ser fornecido.")
    
    resp = await asyncio.to_thread(
        supabase.table('supermercados').select('cnpj, nome').in_('cnpj', request.cnpjs).execute
    )
    mercados_map = {m['cnpj']: m['nome'] for m in resp.data}
    
    tasks = [
        collector_service.consultar_produto(
            request.produto, 
            {"cnpj": cnpj, "nome": mercados_map.get(cnpj, cnpj)}, 
            datetime.now().isoformat(), 
            ECONOMIZA_ALAGOAS_TOKEN, 
            -1
        ) for cnpj in request.cnpjs
    ]
    
    resultados_por_mercado = await asyncio.gather(*tasks, return_exceptions=True)
    resultados_finais = []
    
    for i, resultado in enumerate(resultados_por_mercado):
        if isinstance(resultado, Exception):
            cnpj_com_erro = request.cnpjs[i]
            logging.error(f"Falha na busca em tempo real para o CNPJ {cnpj_com_erro}: {resultado}")
        elif resultado:
            resultados_finais.extend(resultado)
    
    background_tasks.add_task(log_search, request.produto, 'realtime', request.cnpjs, len(resultados_finais), current_user)
    
    return {"results": sorted(resultados_finais, key=lambda x: x.get('preco_produto', float('inf')))}

@app.post("/api/price-history")
async def get_price_history(request: PriceHistoryRequest, user: UserProfile = Depends(require_page_access('compare'))):
    if not request.cnpjs: 
        raise HTTPException(status_code=400, detail="Pelo menos dois mercados devem ser selecionados.")
    if (request.end_date - request.start_date).days > 30: 
        raise HTTPException(status_code=400, detail="O período não pode exceder 30 dias.")
    
    query = supabase.table('produtos').select('nome_supermercado, preco_produto, data_ultima_venda').in_('cnpj_supermercado', request.cnpjs).gte('data_ultima_venda', str(request.start_date)).lte('data_ultima_venda', str(request.end_date))
    
    if request.product_identifier.isdigit() and len(request.product_identifier) > 7:
        query = query.eq('codigo_barras', request.product_identifier)
    else:
        query = query.like('nome_produto_normalizado', f"%{request.product_identifier.lower()}%")
    
    response = await asyncio.to_thread(
        query.execute
    )
    
    if not response.data: 
        return {}
    
    df = pd.DataFrame(response.data)
    df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
    df.dropna(subset=['preco_produto', 'data_ultima_venda'], inplace=True)
    df['data_ultima_venda'] = pd.to_datetime(df['data_ultima_venda']).dt.date
    
    pivot_df = df.pivot_table(index='data_ultima_venda', columns='nome_supermercado', values='preco_produto', aggfunc='min')
    pivot_df.index = pd.to_datetime(pivot_df.index)
    pivot_df = pivot_df.resample('D').mean().interpolate(method='linear')
    
    history_by_market = {}
    for market_name in pivot_df.columns:
        market_series = pivot_df[market_name].dropna()
        history_by_market[market_name] = [{'x': index.strftime('%Y-%m-%d'), 'y': round(value, 2)} for index, value in market_series.items()]
    
    return history_by_market

@app.get("/api/dashboard/summary")
async def get_dashboard_summary(start_date: date, end_date: date, cnpjs: Optional[List[str]] = Query(None), user: UserProfile = Depends(get_current_user)):
    params = {'start_date': str(start_date), 'end_date': str(end_date)}
    if cnpjs: 
        params['market_cnpjs'] = cnpjs
    
    response = await asyncio.to_thread(
        lambda: supabase.rpc('get_dashboard_summary', params).execute()
    )
    
    if not response.data:
        return {"total_mercados": 0, "total_produtos": 0, "total_coletas": 0, "ultima_coleta": None}
    return response.data[0]

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(start_date: date, end_date: date, cnpjs: Optional[List[str]] = Query(None), user: UserProfile = Depends(require_page_access('dashboard'))):
    params = {'start_date': str(start_date), 'end_date': str(end_date)}
    if cnpjs: 
        params['market_cnpjs'] = cnpjs
    
    top_products_resp = await asyncio.to_thread(
        lambda: supabase.rpc('get_top_products_by_filters', params).execute()
    )
    top_markets_resp = await asyncio.to_thread(
        lambda: supabase.rpc('get_top_markets_by_filters', params).execute()
    )
    
    return {"top_products": top_products_resp.data or [], "top_markets": top_markets_resp.data or []}

@app.get("/api/dashboard/bargains")
async def get_dashboard_bargains(start_date: date, end_date: date, cnpjs: Optional[List[str]] = Query(None), category: Optional[str] = Query(None), user: UserProfile = Depends(require_page_access('dashboard'))):
    params = {'start_date': str(start_date), 'end_date': str(end_date)}
    if cnpjs: 
        params['market_cnpjs'] = cnpjs
    
    response = await asyncio.to_thread(
        lambda: supabase.rpc('get_cheapest_products_by_barcode', params).execute()
    )
    
    if not response.data: 
        return []
    
    if not category or category == 'Todos': 
        return response.data
    
    category_rules_resp = await asyncio.to_thread(
        supabase.table('categorias').select('palavras_chave, regra_unidade').eq('nome', category).single().execute
    )
    
    if not category_rules_resp.data: 
        return []
    
    category_rules = category_rules_resp.data
    df = pd.DataFrame(response.data)
    keywords = category_rules.get('palavras_chave', [])
    
    if not keywords: 
        return response.data
    
    regex_pattern = '|'.join(keywords)
    
    if category_rules.get('regra_unidade') == 'KG':
        filtered_df = df[df['nome_produto'].str.contains(regex_pattern, case=False, na=False) & (df['tipo_unidade'] == 'KG')]
    else:
        filtered_df = df[df['nome_produto'].str.contains(regex_pattern, case=False, na=False)]
    
    return filtered_df.to_dict(orient='records')
    
# --- Servir o Frontend ---
app.mount("/", StaticFiles(directory="web", html=True), name="static")

# --------------------------------------------------------------------------
# --- 7. ENDPOINT RAIZ (Sanity Check) ---
# --------------------------------------------------------------------------

@app.get("/")
def read_root():
    return {"message": "Bem-vindo à API de Preços AL - Versão 3.1.2"}

