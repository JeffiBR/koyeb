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
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_admin: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

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
    id: str; role: str; allowed_pages: List[str] = []

async def get_current_user(authorization: str = Header(None)) -> UserProfile:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autorização ausente ou mal formatado")
    jwt = authorization.split(" ")[1]
    try:
        user_response = supabase.auth.get_user(jwt)
        user_id = user_response.user.id
        profile_response = supabase.table('profiles').select('role, allowed_pages').eq('id', user_id).single().execute()
        if not profile_response.data:
            raise HTTPException(status_code=404, detail="Perfil do usuário não encontrado.")
        return UserProfile(id=user_id, role=profile_response.data.get('role', 'user'), allowed_pages=profile_response.data.get('allowed_pages', []))
    except Exception as e:
        if isinstance(e, APIError): raise e
        logging.error(f"Erro de validação de token: {e}")
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

# --- Dependência opcional para obter o usuário atual (se estiver logado) ---
async def get_current_user_optional(authorization: str = Header(None)) -> Optional[UserProfile]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    jwt = authorization.split(" ")[1]
    try:
        user_response = supabase.auth.get_user(jwt)
        user_id = user_response.user.id
        profile_response = supabase.table('profiles').select('role, allowed_pages').eq('id', user_id).single().execute()
        if not profile_response.data:
            return None
        return UserProfile(id=user_id, role=profile_response.data.get('role', 'user'), allowed_pages=profile_response.data.get('allowed_pages', []))
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
    id: Optional[int] = None; nome: str; palavras_chave: List[str]; regra_unidade: Optional[str] = None
class UserCreate(BaseModel):
    email: str; password: str; full_name: str; role: str; allowed_pages: List[str] = []
class UserUpdate(BaseModel):
    full_name: str; role: str; allowed_pages: List[str]
class ProfileUpdate(BaseModel):
    full_name: str; job_title: str; avatar_url: Optional[str] = None
class Supermercado(BaseModel):
    id: Optional[int] = None; nome: str; cnpj: str; endereco: Optional[str] = None
class RealtimeSearchRequest(BaseModel):
    produto: str; cnpjs: List[str]
class PriceHistoryRequest(BaseModel):
    product_identifier: str; cnpjs: List[str]; end_date: date = Field(default_factory=date.today); start_date: date = Field(default_factory=lambda: date.today() - timedelta(days=29))
class PruneByCollectionsRequest(BaseModel):
    cnpj: str; collection_ids: List[int]
class LogDeleteRequest(BaseModel):
    date: Optional[date] = None
    user_id: Optional[str] = None

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
                # Buscar informações completas do perfil do usuário
                profile_response = supabase_admin.table('profiles').select('full_name').eq('id', user_id).single().execute()
                if profile_response.data:
                    user_name = profile_response.data.get('full_name')
                
                # Buscar email do usuário do Auth
                auth_response = supabase_admin.auth.admin.get_user_by_id(user_id)
                if auth_response.user:
                    user_email = auth_response.user.email
                    # Se não encontrou nome no perfil, usar email como nome
                    if not user_name:
                        user_name = user_email
            except Exception as e:
                logging.error(f"Erro ao buscar informações do usuário {user_id}: {e}")
                # Tentar buscar apenas o email como fallback
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
        
        # Usar supabase_admin para garantir permissões
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
                # Buscar informações completas do perfil
                profile_response = supabase_admin.table('profiles').select('full_name').eq('id', user.id).single().execute()
                if profile_response.data:
                    user_name = profile_response.data.get('full_name')
                
                # Buscar email do usuário
                auth_response = supabase_admin.auth.admin.get_user_by_id(user.id)
                if auth_response.user:
                    user_email = auth_response.user.email
                    # Se não encontrou nome no perfil, usar email como nome
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

# --------------------------------------------------------------------------
# --- 6. ENDPOINTS DA APLICAÇÃO ---
# --------------------------------------------------------------------------

# --- Gerenciamento de Usuários ---
@app.post("/api/users")
async def create_user(user_data: UserCreate, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        logging.info(f"Admin {admin_user.id} tentando criar usuário: {user_data.email}")
        created_user_res = supabase_admin.auth.admin.create_user({
            "email": user_data.email, "password": user_data.password,
            "email_confirm": True, "user_metadata": {'full_name': user_data.full_name}
        })
        user_id = created_user_res.user.id
        logging.info(f"Usuário criado no Auth com ID: {user_id}")
        
        profile_update_response = supabase_admin.table('profiles').update({
            'role': user_data.role, 'allowed_pages': user_data.allowed_pages
        }).eq('id', user_id).execute()
        
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
    supabase_admin.table('profiles').update(user_data.dict()).eq('id', user_id).execute()
    return {"message": "Usuário atualizado com sucesso"}
        
@app.get("/api/users")
async def list_users(admin_user: UserProfile = Depends(require_page_access('users'))):
    response = supabase.table('profiles').select('id, full_name, role, allowed_pages, avatar_url').execute()
    return response.data

@app.delete("/api/users/{user_id}", status_code=204)
async def delete_user(user_id: str, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        supabase_admin.auth.admin.delete_user(user_id)
        logging.info(f"Usuário com ID {user_id} foi excluído pelo admin {admin_user.id}")
        return
    except Exception as e:
        logging.error(f"Falha ao excluir usuário {user_id}: {e}")
        raise HTTPException(status_code=400, detail="Não foi possível excluir o usuário.")

# --- Gerenciamento de Perfil Pessoal ---
@app.get("/api/users/me")
async def get_my_profile(current_user: UserProfile = Depends(get_current_user)):
    response = supabase.table('profiles').select('*').eq('id', current_user.id).single().execute()
    return response.data

@app.put("/api/users/me")
async def update_my_profile(profile_data: ProfileUpdate, current_user: UserProfile = Depends(get_current_user)):
    update_data = profile_data.dict(exclude_unset=True)
    response = supabase.table('profiles').update(update_data).eq('id', current_user.id).execute()
    return response.data

# --- Gerenciamento de Categorias ---
@app.get("/api/categories", response_model=List[Categoria])
async def list_categories(user: UserProfile = Depends(get_current_user)):
    resp = supabase.table('categorias').select('*').order('nome').execute()
    return resp.data

@app.post("/api/categories", response_model=Categoria)
async def create_category(categoria: Categoria, admin_user: UserProfile = Depends(require_page_access('users'))):
    resp = supabase.table('categorias').insert(categoria.dict(exclude={'id'})).execute()
    return resp.data[0]

@app.put("/api/categories/{id}", response_model=Categoria)
async def update_category(id: int, categoria: Categoria, admin_user: UserProfile = Depends(require_page_access('users'))):
    resp = supabase.table('categorias').update(categoria.dict(exclude={'id', 'created_at'})).eq('id', id).execute()
    if not resp.data: raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return resp.data[0]

@app.delete("/api/categories/{id}", status_code=204)
async def delete_category(id: int, admin_user: UserProfile = Depends(require_page_access('users'))):
    supabase.table('categorias').delete().eq('id', id).execute()
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
    resp = supabase.table('supermercados').select('id, nome, cnpj, endereco').order('nome').execute()
    return resp.data

@app.post("/api/supermarkets", status_code=201, response_model=Supermercado)
async def create_supermarket(market: Supermercado, user: UserProfile = Depends(require_page_access('markets'))):
    market_data = market.dict(exclude={'id'})
    market_data = {k: v for k, v in market_data.items() if v is not None}
    
    resp = supabase.table('supermercados').insert(market_data).execute()
    return resp.data[0]

@app.put("/api/supermarkets/{id}", response_model=Supermercado)
async def update_supermarket(id: int, market: Supermercado, user: UserProfile = Depends(require_page_access('markets'))):
    market_data = market.dict(exclude={'id'})
    market_data = {k: v for k, v in market_data.items() if v is not None}
    
    resp = supabase.table('supermercados').update(market_data).eq('id', id).execute()
    if not resp.data: 
        raise HTTPException(status_code=404, detail="Mercado não encontrado")
    return resp.data[0]

@app.delete("/api/supermarkets/{id}", status_code=204)
async def delete_supermarket(id: int, user: UserProfile = Depends(require_page_access('markets'))):
    supabase.table('supermercados').delete().eq('id', id).execute()
    return

# --- Endpoint Público de Supermercados ---
@app.get("/api/supermarkets/public", response_model=List[Supermercado])
async def list_supermarkets_public():
    resp = supabase.table('supermercados').select('id, nome, cnpj, endereco').order('nome').execute()
    return resp.data

# --- Gerenciamento de Dados Históricos ---
@app.get("/api/collections")
async def list_collections(user: UserProfile = Depends(require_page_access('collections'))):
    response = supabase.table('coletas').select('*').order('iniciada_em', desc=True).execute()
    return response.data

@app.get("/api/collections/{collection_id}/details")
async def get_collection_details(collection_id: int, user: UserProfile = Depends(require_page_access('collections'))):
    response = supabase.rpc('get_collection_details', {'p_coleta_id': collection_id}).execute()
    return response.data

@app.delete("/api/collections/{collection_id}", status_code=204)
async def delete_collection(collection_id: int, user: UserProfile = Depends(require_page_access('collections'))):
    supabase.table('coletas').delete().eq('id', collection_id).execute()
    return

@app.post("/api/prune-by-collections")
async def prune_by_collections(request: PruneByCollectionsRequest, user: UserProfile = Depends(require_page_access('prune'))):
    if not request.collection_ids:
        raise HTTPException(status_code=400, detail="Pelo menos uma coleta deve ser selecionada.")
    response = supabase.table('produtos').delete().eq('cnpj_supermercado', request.cnpj).in_('coleta_id', request.collection_ids).execute()
    deleted_count = len(response.data)
    logging.info(f"Limpeza de dados: {deleted_count} registros apagados para o CNPJ {request.cnpj} das coletas {request.collection_ids}.")
    return {"message": "Operação de limpeza concluída com sucesso.", "deleted_count": deleted_count}

@app.get("/api/collections-by-market/{cnpj}")
async def get_collections_by_market(cnpj: str, user: UserProfile = Depends(require_page_access('prune'))):
    response = supabase.rpc('get_collections_for_market', {'market_cnpj': cnpj}).execute()
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
    start_index = (page - 1) * page_size
    end_index = start_index + page_size - 1
    
    # Construir query base - USANDO A TABELA log_de_usuarios
    query = supabase.table('log_de_usuarios').select('*', count='exact')
    
    # Aplicar filtros
    if user_id:
        query = query.eq('user_id', user_id)
    if date:
        query = query.gte('created_at', f'{date}T00:00:00').lte('created_at', f'{date}T23:59:59')
    if action_type:
        query = query.eq('action_type', action_type)
    
    # Ordenar e paginar
    response = query.order('created_at', desc=True).range(start_index, end_index).execute()
    
    # Processar logs - agora os dados do usuário já estão no próprio log
    user_logs = []
    for log in response.data:
        user_logs.append({
            'log_id': log['id'],
            'user_id': log.get('user_id'),
            'user_name': log.get('user_name') or 'N/A',
            'user_email': log.get('user_email') or 'N/A',
            'action_type': log.get('action_type'),
            'search_term': log.get('search_term'),
            'selected_markets': log.get('selected_markets'),
            'result_count': log.get('result_count'),
            'page_accessed': log.get('page_accessed'),
            'created_at': log.get('created_at')
        })
    
    return {
        "data": user_logs,
        "total_count": response.count,
        "page": page,
        "page_size": page_size
    }

@app.delete("/api/user-logs/{log_id}")
async def delete_single_log(log_id: int, user: UserProfile = Depends(require_page_access('user_logs'))):
    response = supabase.table('log_de_usuarios').delete().eq('id', log_id).execute()
    return {"message": "Log excluído com sucesso", "deleted_count": len(response.data)}

@app.delete("/api/user-logs")
async def delete_user_logs(
    user_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    query = supabase.table('log_de_usuarios').delete()
    
    if user_id:
        query = query.eq('user_id', user_id)
    if date:
        query = query.gte('created_at', f'{date}T00:00:00').lte('created_at', f'{date}T23:59:59')
    
    response = query.execute()
    return {"message": "Logs excluídos com sucesso", "deleted_count": len(response.data)}

@app.get("/api/user-logs/export")
async def export_user_logs(
    user_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    import csv
    import io
    
    # Buscar todos os logs (sem paginação para exportação)
    query = supabase.table('log_de_usuarios').select('*')
    
    if user_id:
        query = query.eq('user_id', user_id)
    if date:
        query = query.gte('created_at', f'{date}T00:00:00').lte('created_at', f'{date}T23:59:59')
    if action_type:
        query = query.eq('action_type', action_type)
    
    response = query.order('created_at', desc=True).execute()
    
    # Criar CSV em memória
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Escrever cabeçalho
    writer.writerow(['ID', 'Usuário', 'Email', 'Ação', 'Termo Pesquisado', 'Mercados', 'Resultados', 'Página Acessada', 'Data/Hora'])
    
    # Escrever dados
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
        headers={'Content-Disposition': 'attachment; filename=user_logs.csv'}
    )

@app.post("/api/user-logs/delete-by-date")
async def delete_logs_by_date(
    request: LogDeleteRequest,
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    if not request.date:
        raise HTTPException(status_code=400, detail="Data é obrigatória para esta operação.")
        
    try:
        response = supabase.table('log_de_usuarios').delete().lte('created_at', request.date.isoformat()).execute()
        return {"message": f"Logs até a data {request.date.isoformat()} deletados com sucesso."}
    except Exception as e:
        logging.error(f"Erro ao deletar logs por data: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar logs.")

# --- NOVO ENDPOINT PARA LOG DE ACESSO ÀS PÁGINAS ---
@app.post("/api/log-page-access")
async def log_page_access_endpoint(
    page_key: str,
    background_tasks: BackgroundTasks,
    current_user: UserProfile = Depends(get_current_user)
):
    """Endpoint para registrar acesso às páginas do sistema."""
    background_tasks.add_task(log_page_access, page_key, current_user)
    return {"message": "Log de acesso registrado"}

# --- Endpoints Públicos e de Usuário Logado ---
@app.get("/api/products-log")
async def get_products_log(page: int = 1, page_size: int = 50, user: UserProfile = Depends(require_page_access('product_log'))):
    start_index = (page - 1) * page_size
    end_index = start_index + page_size - 1
    response = supabase.table('produtos').select('*', count='exact').order('created_at', desc=True).range(start_index, end_index).execute()
    return {"data": response.data, "total_count": response.count}

@app.get("/api/search")
async def search_products(
    q: str, 
    background_tasks: BackgroundTasks, 
    cnpjs: Optional[List[str]] = Query(None),
    current_user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    termo_busca = f"%{q.lower().strip()}%"
    query = supabase.table('produtos').select('*').ilike('nome_produto_normalizado', termo_busca)
    if cnpjs: query = query.in_('cnpj_supermercado', cnpjs)
    response = query.limit(500).execute()
    
    # Log da busca com user se disponível
    background_tasks.add_task(log_search, q, 'database', cnpjs, len(response.data), current_user)
    
    if not response.data: return {"results": []}
    df = pd.DataFrame(response.data)
    df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
    df.dropna(subset=['preco_produto'], inplace=True)
    if not df.empty:
        preco_medio = df['preco_produto'].mean()
        df['status_preco'] = df['preco_produto'].apply(lambda x: 'Barato' if x < preco_medio * 0.9 else ('Caro' if x > preco_medio * 1.1 else 'Na Média'))
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
    
    resp = supabase.table('supermercados').select('cnpj, nome').in_('cnpj', request.cnpjs).execute()
    mercados_map = {m['cnpj']: m['nome'] for m in resp.data}
    tasks = [collector_service.consultar_produto(request.produto, {"cnpj": cnpj, "nome": mercados_map.get(cnpj, cnpj)}, datetime.now().isoformat(), ECONOMIZA_ALAGOAS_TOKEN, -1) for cnpj in request.cnpjs]
    resultados_por_mercado = await asyncio.gather(*tasks, return_exceptions=True)
    resultados_finais = []
    for i, resultado in enumerate(resultados_por_mercado):
        if isinstance(resultado, Exception):
            cnpj_com_erro = request.cnpjs[i]
            logging.error(f"Falha na busca em tempo real para o CNPJ {cnpj_com_erro}: {resultado}")
        elif resultado:
            resultados_finais.extend(resultado)
    
    # Log da busca em tempo real com user se disponível
    background_tasks.add_task(log_search, request.produto, 'realtime', request.cnpjs, len(resultados_finais), current_user)
    
    return {"results": sorted(resultados_finais, key=lambda x: x.get('preco_produto', float('inf')))}

@app.post("/api/price-history")
async def get_price_history(request: PriceHistoryRequest, user: UserProfile = Depends(require_page_access('compare'))):
    if not request.cnpjs: raise HTTPException(status_code=400, detail="Pelo menos dois mercados devem ser selecionados.")
    if (request.end_date - request.start_date).days > 30: raise HTTPException(status_code=400, detail="O período não pode exceder 30 dias.")
    query = supabase.table('produtos').select('nome_supermercado, preco_produto, data_ultima_venda').in_('cnpj_supermercado', request.cnpjs).gte('data_ultima_venda', str(request.start_date)).lte('data_ultima_venda', str(request.end_date))
    if request.product_identifier.isdigit() and len(request.product_identifier) > 7:
        query = query.eq('codigo_barras', request.product_identifier)
    else:
        query = query.like('nome_produto_normalizado', f"%{request.product_identifier.lower()}%")
    response = query.execute()
    if not response.data: return {}
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
    if cnpjs: params['market_cnpjs'] = cnpjs
    response = supabase.rpc('get_dashboard_summary', params).execute()
    if not response.data:
        return {"total_mercados": 0, "total_produtos": 0, "total_coletas": 0, "ultima_coleta": None}
    return response.data[0]

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(start_date: date, end_date: date, cnpjs: Optional[List[str]] = Query(None), user: UserProfile = Depends(require_page_access('dashboard'))):
    params = {'start_date': str(start_date), 'end_date': str(end_date)}
    if cnpjs: params['market_cnpjs'] = cnpjs
    top_products_resp = supabase.rpc('get_top_products_by_filters', params).execute()
    top_markets_resp = supabase.rpc('get_top_markets_by_filters', params).execute()
    return {"top_products": top_products_resp.data or [], "top_markets": top_markets_resp.data or []}

@app.get("/api/dashboard/bargains")
async def get_dashboard_bargains(start_date: date, end_date: date, cnpjs: Optional[List[str]] = Query(None), category: Optional[str] = Query(None), user: UserProfile = Depends(require_page_access('dashboard'))):
    params = {'start_date': str(start_date), 'end_date': str(end_date)}
    if cnpjs: params['market_cnpjs'] = cnpjs
    response = supabase.rpc('get_cheapest_products_by_barcode', params).execute()
    if not response.data: return []
    if not category or category == 'Todos': return response.data
    category_rules_resp = supabase.table('categorias').select('palavras_chave, regra_unidade').eq('nome', category).single().execute()
    if not category_rules_resp.data: return []
    category_rules = category_rules_resp.data
    df = pd.DataFrame(response.data)
    keywords = category_rules.get('palavras_chave', [])
    if not keywords: return response.data
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
