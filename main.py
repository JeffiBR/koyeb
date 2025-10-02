import os
import asyncio
from datetime import date, timedelta, datetime
import logging
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Depends, Header, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from supabase import create_client, Client
from postgrest.exceptions import APIError
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import pandas as pd

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

# --- Configuração CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Inicialização Supabase ---
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_admin: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY) # Cliente com permissões de Service Role Key

# --------------------------------------------------------------------------
# --- 2. MODELOS DE DADOS (Pydantic) ---
# --------------------------------------------------------------------------

class UserProfile(BaseModel):
    id: str
    email: str
    is_admin: bool
    full_name: Optional[str] = None
    access_pages: List[str] = Field(default_factory=list)

class RealtimeSearchRequest(BaseModel):
    produto: str
    cnpjs: Optional[List[str]] = Field(default_factory=list)

class LogDeleteRequest(BaseModel):
    date: Optional[date] = None
    user_id: Optional[str] = None

# --------------------------------------------------------------------------
# --- 3. FUNÇÕES DE AUTENTICAÇÃO E DEPENDÊNCIAS ---
# --------------------------------------------------------------------------

async def get_current_user(token: str = Header(None, alias="Authorization")) -> UserProfile:
    """Extrai informações do usuário a partir do token JWT e busca seu perfil."""
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autenticação ausente ou inválido.")

    try:
        jwt_token = token.split(" ")[1]
        
        # 1. Autenticar o token
        user_response = supabase_admin.auth.get_user(jwt_token)
        user_data = user_response.user
        
        if not user_data:
             raise HTTPException(status_code=401, detail="Token inválido ou expirado.")

        # 2. Buscar perfil (nome completo e permissões)
        profile_response = supabase_admin.table('profiles').select('full_name, access_pages').eq('id', user_data.id).single().execute()
        
        profile_data = profile_response.data
        if not profile_data:
            raise HTTPException(status_code=403, detail="Perfil de usuário não encontrado.")

        is_admin = 'admin' in profile_data.get('access_pages', [])
        
        return UserProfile(
            id=user_data.id,
            email=user_data.email,
            is_admin=is_admin,
            full_name=profile_data.get('full_name'),
            access_pages=profile_data.get('access_pages', [])
        )
    except APIError as e:
        logging.error(f"Erro Supabase na autenticação: {e.message}")
        raise HTTPException(status_code=401, detail="Falha na autenticação do token.")
    except Exception as e:
        logging.error(f"Erro inesperado na autenticação: {e}")
        raise HTTPException(status_code=500, detail="Erro interno de servidor.")

def require_page_access(page_key: str):
    """Dependência para verificar se o usuário tem permissão para a página."""
    def page_access_checker(current_user: UserProfile = Depends(get_current_user)):
        if page_key not in current_user.access_pages and not current_user.is_admin:
            raise HTTPException(status_code=403, detail=f"Acesso negado. Necessária permissão para '{page_key}'.")
        return current_user
    return page_access_checker

# --------------------------------------------------------------------------
# --- 4. FUNÇÕES DE LOG (LOGIC REFACTOR) ---
# --------------------------------------------------------------------------

def log_page_access(page_key: str, user: UserProfile):
    """Função para registrar o acesso à página, rodando em background."""
    try:
        log_data = {
            "user_id": user.id,
            "user_name": user.full_name,          # NOVO CAMPO
            "user_email": user.email,             # NOVO CAMPO
            "action_type": "access",
            "page_accessed": page_key,
        }
        # Usa o cliente admin para inserir, garantindo as permissões
        supabase_admin.table('log_de_usuarios').insert(log_data).execute()
    except Exception as e:
        logging.error(f"Erro ao salvar log de acesso à página {page_key} para {user.email}: {e}")

def log_search(term: str, type: str, cnpjs: Optional[List[str]], count: int, user: UserProfile):
    """Função para registrar logs de busca, rodando em background."""
    user_name = user.full_name
    user_email = user.email
    user_id = user.id

    log_data = {
        "user_id": user_id,
        "user_name": user_name,         # NOVO CAMPO
        "user_email": user_email,       # NOVO CAMPO
        "action_type": "search" if type == 'database' else "realtime_search",
        "search_term": term,
        "selected_markets": cnpjs if cnpjs else [],
        "result_count": count
    }
    try: 
        # Usa o cliente admin para inserir, garantindo as permissões
        supabase_admin.table('log_de_usuarios').insert(log_data).execute()
    except Exception as e: 
        logging.error(f"Erro ao salvar log de busca para {user_email}: {e}")


# --------------------------------------------------------------------------
# --- 5. ENDPOINTS DE API (AJUSTES NOS LOGS) ---
# --------------------------------------------------------------------------

# ... (outros endpoints como /api/markets, /api/markets/details, /api/markets/by-type, etc. - não mostrados para brevidade)

# Endpoint de busca com ajuste para usar o log_search atualizado
@app.get("/api/search")
async def search_products(
    q: str = Query(..., min_length=3, description="Termo de busca."),
    cnpjs: Optional[List[str]] = Query(None, description="Lista de CNPJs de mercado para filtrar."),
    start_date: date = Query(date.today() - timedelta(days=7), description="Data de início (YYYY-MM-DD)."),
    end_date: date = Query(date.today(), description="Data final (YYYY-MM-DD)."),
    user: UserProfile = Depends(get_current_user), # Pega o usuário logado
    background_tasks: BackgroundTasks = None
):
    # Lógica de busca...
    try:
        params = {
            'search_term': q,
            'start_date': str(start_date),
            'end_date': str(end_date),
            'market_cnpjs': cnpjs if cnpjs else []
        }
        
        response = supabase.rpc('search_products_by_name', params).execute()
        
        # Log da busca com info do usuário
        background_tasks.add_task(log_search, q, 'database', cnpjs, len(response.data), user)

        return response.data
    except Exception as e:
        logging.error(f"Erro ao executar busca em /api/search: {e}")
        raise HTTPException(status_code=500, detail="Erro ao processar a busca no banco de dados.")

# Endpoint de busca em tempo real com ajuste para usar o log_search atualizado
@app.post("/api/realtime-search")
async def realtime_search(
    request: RealtimeSearchRequest,
    user: UserProfile = Depends(get_current_user), # Pega o usuário logado
    background_tasks: BackgroundTasks = None
):
    # Lógica de busca em tempo real...
    try:
        # Simulação de resultados, substitua pela sua lógica real de integração de API
        resultados_finais = [{"nome": "Produto Exemplo", "preco": 10.50}]

        # Log da busca em tempo real com info do usuário
        background_tasks.add_task(log_search, request.produto, 'realtime', request.cnpjs, len(resultados_finais), user)
        
        return resultados_finais
    except Exception as e:
        logging.error(f"Erro ao executar busca em /api/realtime-search: {e}")
        raise HTTPException(status_code=500, detail="Erro ao processar a busca em tempo real.")


# --- ENDPOINTS DE LOGS DE USUÁRIO (CRITICAL REFACTOR) ---

@app.get("/api/user-logs")
async def get_user_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, le=100),
    user_id: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    date_filter: Optional[date] = Query(None),
    user: UserProfile = Depends(require_page_access('user_logs')) # Dependência de acesso
):
    """Busca logs de usuários com paginação e filtros."""
    start_index = (page - 1) * page_size
    end_index = start_index + page_size

    # Usar o cliente admin para consultar a tabela de logs
    query = supabase_admin.table('log_de_usuarios').select('*, count()', head=True)

    # Aplica filtros
    if user_id:
        query = query.eq('user_id', user_id)
    if action_type:
        query = query.eq('action_type', action_type)
    if date_filter:
        start_of_day = datetime.combine(date_filter, datetime.min.time()).isoformat()
        end_of_day = datetime.combine(date_filter, datetime.max.time()).isoformat()
        query = query.gte('created_at', start_of_day).lte('created_at', end_of_day)

    try:
        # 1. Obter a contagem total e os dados paginados
        response = query.order('created_at', desc=True).range(start_index, end_index).execute()
        
        total_logs = response.count if response.count is not None else 0
        
        user_logs = []
        for log in response.data:
            # BUSCA OS DADOS DE USUÁRIO DIRETAMENTE DO REGISTRO DE LOG
            user_logs.append({
                'log_id': log['id'],
                'user_id': log.get('user_id'),
                'user_name': log.get('user_name') or 'Usuário Desconhecido',
                'user_email': log.get('user_email') or 'N/A',
                'action_type': log.get('action_type'),
                'search_term': log.get('search_term'),
                'selected_markets': log.get('selected_markets'),
                'result_count': log.get('result_count'),
                'page_accessed': log.get('page_accessed'),
                'created_at': log.get('created_at')
            })

        return JSONResponse({
            'total_logs': total_logs,
            'logs': user_logs
        })
    except APIError as e:
        logging.error(f"Erro Supabase ao buscar logs: {e.message}")
        raise HTTPException(status_code=500, detail="Erro ao buscar logs no banco de dados.")
    except Exception as e:
        logging.error(f"Erro inesperado ao buscar logs: {e}")
        raise HTTPException(status_code=500, detail="Erro interno de servidor ao carregar logs.")


@app.get("/api/user-logs/export")
async def export_user_logs(
    user_id: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    date_filter: Optional[date] = Query(None),
    user: UserProfile = Depends(require_page_access('user_logs')) # Dependência de acesso
):
    """Exporta logs de usuários filtrados para CSV."""
    
    # Inicia a query
    query = supabase_admin.table('log_de_usuarios').select('*')

    # Aplica filtros (mesma lógica de get_user_logs)
    if user_id:
        query = query.eq('user_id', user_id)
    if action_type:
        query = query.eq('action_type', action_type)
    if date_filter:
        start_of_day = datetime.combine(date_filter, datetime.min.time()).isoformat()
        end_of_day = datetime.combine(date_filter, datetime.max.time()).isoformat()
        query = query.gte('created_at', start_of_day).lte('created_at', end_of_day)

    try:
        response = query.order('created_at', desc=True).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Nenhum log encontrado para exportação.")

        # Cria a lista de logs no formato final
        logs_data = []
        for log in response.data:
            # BUSCA OS DADOS DE USUÁRIO DIRETAMENTE DO REGISTRO DE LOG
            logs_data.append({
                'ID do Log': log['id'],
                'Data/Hora': log.get('created_at'),
                'ID do Usuário': log.get('user_id'),
                'Nome do Usuário': log.get('user_name') or 'Desconhecido',
                'E-mail do Usuário': log.get('user_email') or 'N/A',
                'Tipo de Ação': log.get('action_type'),
                'Página Acessada': log.get('page_accessed') or '',
                'Termo Pesquisado': log.get('search_term') or '',
                'Mercados Selecionados': ', '.join(log.get('selected_markets', [])),
                'Contagem de Resultados': log.get('result_count')
            })

        # Cria DataFrame e exporta para CSV
        df = pd.DataFrame(logs_data)
        csv_output = df.to_csv(index=False, sep=';', encoding='utf-8-sig')
        
        return Response(
            content=csv_output,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=logs-usuarios-{date.today()}.csv"
            }
        )

    except APIError as e:
        logging.error(f"Erro Supabase ao exportar logs: {e.message}")
        raise HTTPException(status_code=500, detail="Erro ao exportar logs do banco de dados.")

# --- ENDPOINTS DE ADMINISTRAÇÃO DE LOGS ---

@app.post("/api/user-logs/delete-by-date")
async def delete_logs_by_date(
    request: LogDeleteRequest,
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    """Deleta logs até uma data específica."""
    if not request.date:
        raise HTTPException(status_code=400, detail="Data é obrigatória para esta operação.")
        
    try:
        # Usa o cliente admin para deletar
        response = supabase_admin.table('log_de_usuarios').delete().lte('created_at', request.date.isoformat()).execute()
        
        # O postgrest não retorna a contagem, mas a execução bem sucedida basta.
        return JSONResponse({"message": f"Logs até a data {request.date.isoformat()} deletados com sucesso."})

    except Exception as e:
        logging.error(f"Erro ao deletar logs por data: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar logs.")

# ... (outros endpoints como delete_logs_by_user e delete_all_logs - não mostrados para brevidade)

# --------------------------------------------------------------------------
# --- 6. SERVIÇOS AUXILIARES ---
# --------------------------------------------------------------------------

@app.get("/api/users")
async def get_all_users(user: UserProfile = Depends(require_page_access('user_logs'))):
    """Retorna a lista de usuários para uso nos filtros de log."""
    try:
        # Busca usuários do módulo de auth (requer Service Role Key)
        auth_response = supabase_admin.auth.admin.list_users()
        users = auth_response.users
        
        # Mapeia para um formato amigável
        user_list = [{'id': u.id, 'email': u.email} for u in users]
        
        # Opcional: Busca nome completo da tabela 'profiles' para melhor UX
        # ... (pode ser implementado aqui, mas o email já identifica bem)
        
        return user_list
    except Exception as e:
        logging.error(f"Erro ao buscar lista de usuários: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar lista de usuários.")

# ... (outros endpoints de utilidade como /api/categories, /api/dashboard/*, etc. - não mostrados para brevidade)

# --- Montar arquivos estáticos ---
app.mount("/", StaticFiles(directory="public", html=True), name="static")

# --------------------------------------------------------------------------
# --- 7. ENDPOINT RAIZ (Sanity Check) ---
# --------------------------------------------------------------------------

@app.get("/")
def read_root():
    return {"message": "Bem-vindo à API de Preços AL - Versão 3.1.2"}

# --- FIM DO main.py ---
