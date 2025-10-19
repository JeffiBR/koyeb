# group_admin_routes.py - Funções específicas para gerenciamento de subadministradores

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, date, timedelta
from pydantic import BaseModel, Field
import logging
import asyncio

# Importar dependências compartilhadas
from dependencies import get_current_user, UserProfile, require_page_access, supabase, supabase_admin, APIError, calcular_data_expiracao

# Criar router específico para group admins
group_admin_router = APIRouter(prefix="/api/group-admin", tags=["group-admin"])

# --------------------------------------------------------------------------
# --- MODELOS PARA SUBADMINISTRADORES ---
# --------------------------------------------------------------------------

class GroupAdminCreate(BaseModel):
    user_id: str
    group_ids: List[int] = Field(..., description="Lista de IDs dos grupos que o subadmin pode gerenciar")

class GroupAdminUpdate(BaseModel):
    group_ids: List[int] = Field(..., description="Lista de IDs dos grupos que o subadmin pode gerenciar")

class GroupAdmin(BaseModel):
    user_id: str
    group_ids: List[int]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class GroupAdminWithDetails(GroupAdmin):
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    group_names: List[str] = []

# Modelos para gerenciamento de usuários por subadministradores
class GroupUserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    allowed_pages: List[str] = []
    group_id: int

class GroupUserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    allowed_pages: Optional[List[str]] = None
    data_expiracao: Optional[str] = None

class UserRenewRequest(BaseModel):
    dias_adicionais: int = Field(..., ge=1, le=365)

# --------------------------------------------------------------------------
# --- FUNÇÕES AUXILIARES PARA SUBADMINISTRADORES ---
# --------------------------------------------------------------------------

async def get_user_managed_groups(user_id: str) -> List[int]:
    """Obtém a lista de grupos que um usuário pode gerenciar como subadmin"""
    try:
        response = await asyncio.to_thread(
            supabase.table('group_admins')
            .select('group_ids')
            .eq('user_id', user_id)
            .single()
            .execute
        )
        if response.data:
            return response.data.get('group_ids', [])
        return []
    except Exception as e:
        logging.error(f"Erro ao buscar grupos gerenciados pelo usuário {user_id}: {e}")
        return []

async def verify_group_admin_access(user_id: str, group_id: int) -> bool:
    """Verifica se um usuário tem permissão de subadmin para um grupo específico"""
    try:
        managed_groups = await get_user_managed_groups(user_id)
        return group_id in managed_groups
    except Exception as e:
        logging.error(f"Erro ao verificar acesso de subadmin: {e}")
        return False

async def get_group_admin_user(current_user: UserProfile = Depends(get_current_user)) -> UserProfile:
    """Dependência para verificar se o usuário é subadmin"""
    if current_user.role == 'admin':
        return current_user
    
    managed_groups = await get_user_managed_groups(current_user.id)
    if not managed_groups:
        raise HTTPException(
            status_code=403, 
            detail="Acesso negado. Você não tem permissões de subadministrador."
        )
    
    # Adiciona os grupos gerenciados ao perfil do usuário
    current_user.managed_groups = managed_groups
    return current_user

# --------------------------------------------------------------------------
# --- ENDPOINTS PARA GERENCIAMENTO DE SUBADMINISTRADORES (APENAS ADMIN GERAL) ---
# --------------------------------------------------------------------------

@group_admin_router.post("", response_model=GroupAdmin)
async def create_group_admin(
    admin_data: GroupAdminCreate,
    current_user: UserProfile = Depends(require_page_access('group_admin'))
):
    """Cria um novo subadministrador (apenas admin geral)"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Apenas administradores gerais podem criar subadministradores")
    
    try:
        # Verifica se o usuário existe
        user_response = await asyncio.to_thread(
            supabase.table('profiles').select('id, full_name').eq('id', admin_data.user_id).single().execute
        )
        if not user_response.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        
        # Verifica se os grupos existem
        groups_response = await asyncio.to_thread(
            supabase.table('grupos').select('id').in_('id', admin_data.group_ids).execute
        )
        existing_group_ids = [group['id'] for group in groups_response.data]
        invalid_groups = set(admin_data.group_ids) - set(existing_group_ids)
        
        if invalid_groups:
            raise HTTPException(status_code=404, detail=f"Grupos não encontrados: {invalid_groups}")
        
        # Cria o registro de subadmin
        admin_record = {
            'user_id': admin_data.user_id,
            'group_ids': admin_data.group_ids
        }
        
        response = await asyncio.to_thread(
            supabase.table('group_admins').insert(admin_record).execute
        )
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar subadministrador: {e}")
        raise HTTPException(status_code=400, detail="Erro ao criar subadministrador")

@group_admin_router.get("", response_model=List[GroupAdminWithDetails])
async def list_group_admins(
    current_user: UserProfile = Depends(require_page_access('group_admin'))
):
    """Lista todos os subadministradores (apenas admin geral)"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Apenas administradores gerais podem listar subadministradores")
    
    try:
        response = await asyncio.to_thread(
            supabase.table('group_admins').select('*').order('created_at').execute
        )
        
        admins_with_details = []
        
        for admin in response.data:
            # Busca informações do usuário
            user_response = await asyncio.to_thread(
                supabase.table('profiles').select('full_name').eq('id', admin['user_id']).execute
            )
            user_name = user_response.data[0]['full_name'] if user_response.data else 'N/A'
            
            # Busca email do usuário
            user_email = "N/A"
            try:
                auth_response = await asyncio.to_thread(
                    lambda: supabase_admin.auth.admin.get_user_by_id(admin['user_id'])
                )
                if auth_response.user:
                    user_email = auth_response.user.email
            except Exception as e:
                logging.error(f"Erro ao buscar email do usuário {admin['user_id']}: {e}")
            
            # Busca nomes dos grupos
            group_names = []
            if admin['group_ids']:
                groups_response = await asyncio.to_thread(
                    supabase.table('grupos').select('nome').in_('id', admin['group_ids']).execute
                )
                group_names = [group['nome'] for group in groups_response.data]
            
            admin_with_details = GroupAdminWithDetails(
                user_id=admin['user_id'],
                group_ids=admin['group_ids'],
                created_at=admin['created_at'],
                updated_at=admin['updated_at'],
                user_name=user_name,
                user_email=user_email,
                group_names=group_names
            )
            admins_with_details.append(admin_with_details)
        
        return admins_with_details
        
    except Exception as e:
        logging.error(f"Erro ao listar subadministradores: {e}")
        raise HTTPException(status_code=500, detail="Erro ao listar subadministradores")

@group_admin_router.put("/{user_id}", response_model=GroupAdmin)
async def update_group_admin(
    user_id: str,
    admin_data: GroupAdminUpdate,
    current_user: UserProfile = Depends(require_page_access('group_admin'))
):
    """Atualiza um subadministrador (apenas admin geral)"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Apenas administradores gerais podem atualizar subadministradores")
    
    try:
        # Verifica se o subadmin existe
        existing_response = await asyncio.to_thread(
            supabase.table('group_admins').select('*').eq('user_id', user_id).single().execute
        )
        if not existing_response.data:
            raise HTTPException(status_code=404, detail="Subadministrador não encontrado")
        
        # Verifica se os grupos existem
        groups_response = await asyncio.to_thread(
            supabase.table('grupos').select('id').in_('id', admin_data.group_ids).execute
        )
        existing_group_ids = [group['id'] for group in groups_response.data]
        invalid_groups = set(admin_data.group_ids) - set(existing_group_ids)
        
        if invalid_groups:
            raise HTTPException(status_code=404, detail=f"Grupos não encontrados: {invalid_groups}")
        
        # Atualiza o registro
        update_data = {
            'group_ids': admin_data.group_ids,
            'updated_at': datetime.now().isoformat()
        }
        
        response = await asyncio.to_thread(
            supabase.table('group_admins').update(update_data).eq('user_id', user_id).execute
        )
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar subadministrador: {e}")
        raise HTTPException(status_code=400, detail="Erro ao atualizar subadministrador")

@group_admin_router.delete("/{user_id}", status_code=204)
async def delete_group_admin(
    user_id: str,
    current_user: UserProfile = Depends(require_page_access('group_admin'))
):
    """Remove um subadministrador (apenas admin geral)"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Apenas administradores gerais podem remover subadministradores")
    
    try:
        await asyncio.to_thread(
            lambda: supabase.table('group_admins').delete().eq('user_id', user_id).execute()
        )
        return
    except Exception as e:
        logging.error(f"Erro ao deletar subadministrador: {e}")
        raise HTTPException(status_code=400, detail="Erro ao deletar subadministrador")

# --------------------------------------------------------------------------
# --- ENDPOINTS ESPECÍFICOS PARA SUBADMINISTRADORES GERENCIAREM SEUS USUÁRIOS ---
# --------------------------------------------------------------------------

@group_admin_router.get("/users", response_model=List[dict])
async def get_group_users(
    group_id: int = Query(..., description="ID do grupo para listar usuários"),
    current_user: UserProfile = Depends(get_group_admin_user)
):
    """Lista usuários de um grupo específico (subadmin)"""
    try:
        # Verifica se o subadmin tem acesso ao grupo
        if current_user.role != 'admin' and not await verify_group_admin_access(current_user.id, group_id):
            raise HTTPException(status_code=403, detail="Acesso negado a este grupo")
        
        # Busca usuários do grupo
        user_groups_response = await asyncio.to_thread(
            supabase_admin.table('user_groups')
            .select('user_id, data_expiracao, created_at')
            .eq('group_id', group_id)
            .execute
        )
        
        if not user_groups_response.data:
            return []
        
        users_with_details = []
        
        for user_group in user_groups_response.data:
            user_id = user_group['user_id']
            
            # Busca informações do perfil
            profile_response = await asyncio.to_thread(
                supabase_admin.table('profiles')
                .select('full_name, role, allowed_pages, avatar_url')
                .eq('id', user_id)
                .single()
                .execute
            )
            
            # Busca email do usuário
            user_email = "N/A"
            try:
                auth_response = await asyncio.to_thread(
                    lambda: supabase_admin.auth.admin.get_user_by_id(user_id)
                )
                if auth_response.user:
                    user_email = auth_response.user.email
            except Exception as e:
                logging.error(f"Erro ao buscar email do usuário {user_id}: {e}")
            
            if profile_response.data:
                user_data = {
                    "id": user_id,
                    "full_name": profile_response.data.get('full_name'),
                    "email": user_email,
                    "role": profile_response.data.get('role'),
                    "allowed_pages": profile_response.data.get('allowed_pages', []),
                    "avatar_url": profile_response.data.get('avatar_url'),
                    "data_expiracao": user_group['data_expiracao'],
                    "created_at": user_group['created_at']
                }
                users_with_details.append(user_data)
        
        return users_with_details
        
    except Exception as e:
        logging.error(f"Erro ao listar usuários do grupo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao listar usuários do grupo")

@group_admin_router.post("/users", response_model=dict)
async def create_group_user(
    user_data: GroupUserCreate,
    current_user: UserProfile = Depends(get_group_admin_user)
):
    """Cria um novo usuário em um grupo específico (subadmin)"""
    try:
        # Verifica se o subadmin tem acesso ao grupo
        if current_user.role != 'admin' and not await verify_group_admin_access(current_user.id, user_data.group_id):
            raise HTTPException(status_code=403, detail="Acesso negado a este grupo")
        
        # Verifica se o grupo existe
        group_response = await asyncio.to_thread(
            supabase.table('grupos').select('dias_acesso').eq('id', user_data.group_id).single().execute
        )
        if not group_response.data:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")
        
        # Cria o usuário no Auth
        created_user_res = await asyncio.to_thread(
            lambda: supabase_admin.auth.admin.create_user({
                "email": user_data.email, 
                "password": user_data.password,
                "email_confirm": True, 
                "user_metadata": {'full_name': user_data.full_name}
            })
        )
        
        user_id = created_user_res.user.id
        logging.info(f"Usuário criado no Auth com ID: {user_id}")
        
        # Atualiza o perfil com role 'user' (subadmins só podem criar usuários comuns)
        profile_update_response = await asyncio.to_thread(
            supabase_admin.table('profiles').update({
                'role': 'user',
                'allowed_pages': user_data.allowed_pages,
                'full_name': user_data.full_name
            }).eq('id', user_id).execute
        )
        
        if not profile_update_response.data:
            logging.warning(f"Usuário {user_id} foi criado no Auth, mas o perfil não foi encontrado para atualizar.")
            raise HTTPException(status_code=404, detail="Usuário criado, mas o perfil não foi encontrado.")
        
        # Associa o usuário ao grupo
        dias_acesso = group_response.data['dias_acesso']
        data_expiracao = calcular_data_expiracao(dias_acesso)
        
        user_group_data = {
            'user_id': user_id,
            'group_id': user_data.group_id,
            'data_expiracao': data_expiracao.isoformat()
        }
        
        await asyncio.to_thread(
            supabase_admin.table('user_groups').insert(user_group_data).execute
        )
        
        logging.info(f"Usuário {user_id} criado e associado ao grupo {user_data.group_id} pelo subadmin {current_user.id}")
        return {"message": "Usuário criado com sucesso no grupo"}
        
    except APIError as e:
        logging.error(f"Erro da API do Supabase ao criar usuário: {e}")
        raise HTTPException(status_code=400, detail=f"Erro do Supabase: {e.message}")
    except Exception as e:
        logging.error(f"Falha CRÍTICA ao criar usuário: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno inesperado no servidor.")

@group_admin_router.put("/users/{user_id}", response_model=dict)
async def update_group_user(
    user_id: str,
    user_data: GroupUserUpdate,
    current_user: UserProfile = Depends(get_group_admin_user)
):
    """Atualiza um usuário em um grupo específico (subadmin)"""
    try:
        # Verifica se o usuário pertence a algum grupo gerenciado pelo subadmin
        user_groups_response = await asyncio.to_thread(
            supabase_admin.table('user_groups')
            .select('group_id')
            .eq('user_id', user_id)
            .execute
        )
        
        if not user_groups_response.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado em nenhum grupo")
        
        user_group_ids = [ug['group_id'] for ug in user_groups_response.data]
        has_access = any(await verify_group_admin_access(current_user.id, group_id) for group_id in user_group_ids)
        
        if current_user.role != 'admin' and not has_access:
            raise HTTPException(status_code=403, detail="Acesso negado a este usuário")
        
        # Atualiza o perfil
        update_data = {}
        if user_data.full_name is not None:
            update_data['full_name'] = user_data.full_name
        if user_data.allowed_pages is not None:
            update_data['allowed_pages'] = user_data.allowed_pages
        
        if update_data:
            await asyncio.to_thread(
                lambda: supabase_admin.table('profiles')
                .update(update_data)
                .eq('id', user_id)
                .execute()
            )
        
        # Atualiza email se fornecido
        if user_data.email:
            try:
                await asyncio.to_thread(
                    lambda: supabase_admin.auth.admin.update_user_by_id(
                        user_id,
                        {"email": user_data.email}
                    )
                )
            except Exception as e:
                logging.error(f"Erro ao atualizar email do usuário: {e}")
        
        # Atualiza data de expiração se fornecida
        if user_data.data_expiracao:
            # Atualiza em todos os grupos do usuário que o subadmin gerencia
            for group_id in user_group_ids:
                if current_user.role == 'admin' or await verify_group_admin_access(current_user.id, group_id):
                    await asyncio.to_thread(
                        lambda: supabase_admin.table('user_groups')
                        .update({'data_expiracao': user_data.data_expiracao})
                        .eq('user_id', user_id)
                        .eq('group_id', group_id)
                        .execute()
                    )
        
        return {"message": "Usuário atualizado com sucesso"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar usuário do grupo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao atualizar usuário")

@group_admin_router.delete("/users/{user_id}", status_code=204)
async def delete_group_user(
    user_id: str,
    current_user: UserProfile = Depends(get_group_admin_user)
):
    """Remove um usuário de um grupo específico (subadmin)"""
    try:
        # Verifica se o usuário pertence a algum grupo gerenciado pelo subadmin
        user_groups_response = await asyncio.to_thread(
            supabase_admin.table('user_groups')
            .select('group_id')
            .eq('user_id', user_id)
            .execute
        )
        
        if not user_groups_response.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado em nenhum grupo")
        
        user_group_ids = [ug['group_id'] for ug in user_groups_response.data]
        has_access = any(await verify_group_admin_access(current_user.id, group_id) for group_id in user_group_ids)
        
        if current_user.role != 'admin' and not has_access:
            raise HTTPException(status_code=403, detail="Acesso negado a este usuário")
        
        # Remove o usuário de todos os grupos gerenciados pelo subadmin
        for group_id in user_group_ids:
            if current_user.role == 'admin' or await verify_group_admin_access(current_user.id, group_id):
                await asyncio.to_thread(
                    lambda: supabase_admin.table('user_groups')
                    .delete()
                    .eq('user_id', user_id)
                    .eq('group_id', group_id)
                    .execute()
                )
        
        # Não deleta o usuário do Auth, apenas remove dos grupos
        logging.info(f"Usuário {user_id} removido dos grupos pelo subadmin {current_user.id}")
        return
        
    except Exception as e:
        logging.error(f"Erro ao remover usuário do grupo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao remover usuário do grupo")

@group_admin_router.post("/users/{user_id}/renew", response_model=dict)
async def renew_user_access(
    user_id: str,
    renew_data: UserRenewRequest,
    current_user: UserProfile = Depends(get_group_admin_user)
):
    """Renova o acesso de um usuário em um grupo específico (subadmin) - CORRIGIDO"""
    try:
        # Buscar todas as associações do usuário
        user_groups_response = await asyncio.to_thread(
            supabase_admin.table('user_groups')
            .select('id, group_id, data_expiracao')
            .eq('user_id', user_id)
            .execute
        )
        
        if not user_groups_response.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado em nenhum grupo")
        
        # Verificar se o admin tem acesso a pelo menos um grupo do usuário
        user_group_ids = [ug['group_id'] for ug in user_groups_response.data]
        has_access = any(await verify_group_admin_access(current_user.id, group_id) for group_id in user_group_ids)
        
        if current_user.role != 'admin' and not has_access:
            raise HTTPException(status_code=403, detail="Acesso negado a este usuário")
        
        # Calcular nova data
        data_atual = date.today()
        dias_adicionais = renew_data.dias_adicionais
        
        updated_count = 0
        
        # Atualizar cada associação que o admin tem acesso
        for user_group in user_groups_response.data:
            group_id = user_group['group_id']
            
            if current_user.role == 'admin' or await verify_group_admin_access(current_user.id, group_id):
                data_expiracao = user_group['data_expiracao']
                
                # Converter string para date se necessário
                if isinstance(data_expiracao, str):
                    data_expiracao = datetime.fromisoformat(data_expiracao).date()
                
                # Calcular nova data
                if data_expiracao < data_atual:
                    nova_data = data_atual + timedelta(days=dias_adicionais)
                else:
                    nova_data = data_expiracao + timedelta(days=dias_adicionais)
                
                # Atualizar no banco
                await asyncio.to_thread(
                    lambda: supabase_admin.table('user_groups')
                    .update({'data_expiracao': nova_data.isoformat()})
                    .eq('id', user_group['id'])
                    .execute()
                )
                updated_count += 1
        
        if updated_count == 0:
            raise HTTPException(status_code=403, detail="Nenhuma associação pôde ser renovada")
        
        return {"message": f"Acesso renovado por {dias_adicionais} dias para {updated_count} associação(ões)"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao renovar acesso do usuário: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao renovar acesso: {str(e)}")

# --------------------------------------------------------------------------
# --- ENDPOINTS PARA SUBADMINISTRADORES VERIFICAREM SEUS GRUPOS ---
# --------------------------------------------------------------------------

@group_admin_router.get("/my-groups", response_model=List[dict])
async def get_my_groups(
    current_user: UserProfile = Depends(get_group_admin_user)
):
    """Lista os grupos que o subadministrador atual pode gerenciar"""
    try:
        if current_user.role == 'admin':
            # Admin geral vê todos os grupos
            groups_response = await asyncio.to_thread(
                supabase.table('grupos').select('*').order('nome').execute
            )
            return groups_response.data or []
        else:
            # Subadmin vê apenas seus grupos designados
            managed_groups = await get_user_managed_groups(current_user.id)
            if not managed_groups:
                return []
            
            groups_response = await asyncio.to_thread(
                supabase.table('grupos')
                .select('*')
                .in_('id', managed_groups)
                .order('nome')
                .execute
            )
            
            groups_with_details = []
            for group in groups_response.data:
                # Contar usuários ativos no grupo
                user_groups_response = await asyncio.to_thread(
                    supabase_admin.table('user_groups')
                    .select('user_id', count='exact')
                    .eq('group_id', group['id'])
                    .gte('data_expiracao', date.today().isoformat())
                    .execute
                )
                
                group_with_details = {
                    **group,
                    'usuarios_ativos': user_groups_response.count or 0
                }
                groups_with_details.append(group_with_details)
            
            return groups_with_details
        
    except Exception as e:
        logging.error(f"Erro ao listar grupos do subadministrador: {e}")
        raise HTTPException(status_code=500, detail="Erro ao listar grupos")
