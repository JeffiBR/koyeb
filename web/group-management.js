// group-management.js - Gerenciamento completo de grupos
class GroupManagement {
    constructor() {
        this.currentUser = null;
        this.groups = [];
        this.groupAdmins = [];
        this.init();
    }

    async init() {
        console.log('Inicializando GroupManagement...');
        try {
            await this.checkAuth();
            await this.loadGroups();
            await this.loadGroupAdmins();
            this.setupEventListeners();
            this.renderGroups();
            this.renderGroupAdmins();
        } catch (error) {
            console.error('Erro na inicialização:', error);
            this.showError('Erro ao inicializar: ' + error.message);
        }
    }

    async checkAuth() {
        try {
            const isAuthenticated = await checkAuth();
            if (!isAuthenticated) {
                window.location.href = 'login.html';
                return;
            }

            this.currentUser = await fetchUserProfile();
            if (!this.currentUser) {
                throw new Error('Não foi possível carregar perfil do usuário');
            }

            // Verificar se é admin
            if (this.currentUser.role !== 'admin') {
                this.showError('Acesso negado. Apenas administradores podem gerenciar grupos.');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 3000);
                return;
            }

        } catch (error) {
            console.error('Erro de autenticação:', error);
            window.location.href = 'login.html';
        }
    }

    async loadGroups() {
        try {
            const response = await authenticatedFetch('/api/groups');
            if (response.ok) {
                this.groups = await response.json();
            } else {
                throw new Error('Falha ao carregar grupos');
            }
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
            this.showError('Erro ao carregar lista de grupos: ' + error.message);
        }
    }

    async loadGroupAdmins() {
        try {
            const response = await authenticatedFetch('/api/group-admin');
            if (response.ok) {
                this.groupAdmins = await response.json();
            } else {
                throw new Error('Falha ao carregar admins de grupo');
            }
        } catch (error) {
            console.error('Erro ao carregar admins de grupo:', error);
            this.showError('Erro ao carregar lista de admins: ' + error.message);
        }
    }

    setupEventListeners() {
        // Criar grupo
        const createBtn = document.getElementById('createGroupBtn');
        if (createBtn) {
            createBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.createGroup();
            });
        }

        // Criar admin de grupo
        const createAdminBtn = document.getElementById('createGroupAdminBtn');
        if (createAdminBtn) {
            createAdminBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.createGroupAdmin();
            });
        }

        // Atualizar lista
        const refreshBtn = document.getElementById('refreshGroupsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadGroups();
                this.loadGroupAdmins();
            });
        }

        // Fechar modais
        document.querySelectorAll('.close-modal').forEach(button => {
            button.addEventListener('click', () => {
                this.closeModals();
            });
        });

        // Fechar modais ao clicar fora
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModals();
                }
            });
        });
    }

    async createGroup() {
        const name = document.getElementById('newGroupName').value;
        const diasAcesso = parseInt(document.getElementById('newGroupDiasAcesso').value);
        const descricao = document.getElementById('newGroupDescription').value;

        if (!name || !diasAcesso) {
            this.showError('Por favor, preencha todos os campos obrigatórios');
            return;
        }

        try {
            const response = await authenticatedFetch('/api/groups', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nome: name,
                    dias_acesso: diasAcesso,
                    descricao: descricao
                })
            });

            if (response.ok) {
                this.showSuccess('Grupo criado com sucesso!');
                // Limpar formulário
                document.getElementById('newGroupName').value = '';
                document.getElementById('newGroupDiasAcesso').value = '30';
                document.getElementById('newGroupDescription').value = '';
                
                await this.loadGroups();
                this.closeModals();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao criar grupo');
            }
        } catch (error) {
            console.error('Erro ao criar grupo:', error);
            this.showError('Erro ao criar grupo: ' + error.message);
        }
    }

    async createGroupAdmin() {
        const userId = document.getElementById('newGroupAdminUserId').value;
        const groupIds = this.getSelectedGroups();

        if (!userId || groupIds.length === 0) {
            this.showError('Por favor, selecione um usuário e pelo menos um grupo');
            return;
        }

        try {
            const response = await authenticatedFetch('/api/group-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: userId,
                    group_ids: groupIds
                })
            });

            if (response.ok) {
                this.showSuccess('Admin de grupo designado com sucesso!');
                // Limpar formulário
                document.getElementById('newGroupAdminUserId').value = '';
                this.clearSelectedGroups();
                
                await this.loadGroupAdmins();
                this.closeModals();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao designar admin de grupo');
            }
        } catch (error) {
            console.error('Erro ao designar admin de grupo:', error);
            this.showError('Erro ao designar admin de grupo: ' + error.message);
        }
    }

    getSelectedGroups() {
        const checkboxes = document.querySelectorAll('#groupSelectionContainer input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => parseInt(cb.value));
    }

    clearSelectedGroups() {
        document.querySelectorAll('#groupSelectionContainer input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
    }

    openEditGroupModal(group) {
        document.getElementById('editGroupId').value = group.id;
        document.getElementById('editGroupName').value = group.nome;
        document.getElementById('editGroupDiasAcesso').value = group.dias_acesso;
        document.getElementById('editGroupDescription').value = group.descricao || '';

        document.getElementById('editGroupModal').classList.add('active');
    }

    openEditGroupAdminModal(admin) {
        document.getElementById('editGroupAdminUserId').value = admin.user_id;
        document.getElementById('editGroupAdminUserName').textContent = admin.user_name;
        
        // Marcar os grupos selecionados
        this.clearSelectedGroups();
        admin.group_ids.forEach(groupId => {
            const checkbox = document.querySelector(`#editGroupSelectionContainer input[value="${groupId}"]`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });

        document.getElementById('editGroupAdminModal').classList.add('active');
    }

    async updateGroup() {
        const groupId = document.getElementById('editGroupId').value;
        const name = document.getElementById('editGroupName').value;
        const diasAcesso = parseInt(document.getElementById('editGroupDiasAcesso').value);
        const descricao = document.getElementById('editGroupDescription').value;

        if (!name || !diasAcesso) {
            this.showError('Por favor, preencha todos os campos obrigatórios');
            return;
        }

        try {
            const response = await authenticatedFetch(`/api/groups/${groupId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nome: name,
                    dias_acesso: diasAcesso,
                    descricao: descricao
                })
            });

            if (response.ok) {
                this.showSuccess('Grupo atualizado com sucesso!');
                this.closeModals();
                await this.loadGroups();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao atualizar grupo');
            }
        } catch (error) {
            console.error('Erro ao atualizar grupo:', error);
            this.showError('Erro ao atualizar grupo: ' + error.message);
        }
    }

    async updateGroupAdmin() {
        const userId = document.getElementById('editGroupAdminUserId').value;
        const groupIds = this.getSelectedGroups();

        if (groupIds.length === 0) {
            this.showError('Por favor, selecione pelo menos um grupo');
            return;
        }

        try {
            const response = await authenticatedFetch(`/api/group-admin/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    group_ids: groupIds
                })
            });

            if (response.ok) {
                this.showSuccess('Admin de grupo atualizado com sucesso!');
                this.closeModals();
                await this.loadGroupAdmins();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao atualizar admin de grupo');
            }
        } catch (error) {
            console.error('Erro ao atualizar admin de grupo:', error);
            this.showError('Erro ao atualizar admin de grupo: ' + error.message);
        }
    }

    async deleteGroup(groupId) {
        if (!confirm('Tem certeza que deseja excluir este grupo? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            const response = await authenticatedFetch(`/api/groups/${groupId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showSuccess('Grupo excluído com sucesso!');
                await this.loadGroups();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao excluir grupo');
            }
        } catch (error) {
            console.error('Erro ao excluir grupo:', error);
            this.showError('Erro ao excluir grupo: ' + error.message);
        }
    }

    async deleteGroupAdmin(userId) {
        if (!confirm('Tem certeza que deseja remover este admin de grupo?')) {
            return;
        }

        try {
            const response = await authenticatedFetch(`/api/group-admin/${userId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showSuccess('Admin de grupo removido com sucesso!');
                await this.loadGroupAdmins();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao remover admin de grupo');
            }
        } catch (error) {
            console.error('Erro ao remover admin de grupo:', error);
            this.showError('Erro ao remover admin de grupo: ' + error.message);
        }
    }

    renderGroups() {
        const container = document.getElementById('groupsList');
        if (!container) return;
        
        if (this.groups.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-layer-group"></i>
                    <h4>Nenhum grupo criado</h4>
                    <p>Comece criando o primeiro grupo</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.groups.map(group => `
            <div class="group-card">
                <div class="group-header">
                    <h4>${group.nome}</h4>
                    <span class="group-days">${group.dias_acesso} dias de acesso</span>
                </div>
                <div class="group-description">
                    ${group.descricao || 'Sem descrição'}
                </div>
                <div class="group-meta">
                    <small>Criado em: ${new Date(group.created_at).toLocaleDateString('pt-BR')}</small>
                </div>
                <div class="group-actions">
                    <button class="btn outline edit-group" data-group-id="${group.id}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn danger delete-group" data-group-id="${group.id}">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                </div>
            </div>
        `).join('');

        this.attachGroupActionListeners();
    }

    renderGroupAdmins() {
        const container = document.getElementById('groupAdminsList');
        if (!container) return;
        
        if (this.groupAdmins.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-shield"></i>
                    <h4>Nenhum admin de grupo designado</h4>
                    <p>Designe o primeiro admin de grupo</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.groupAdmins.map(admin => `
            <div class="admin-card">
                <div class="admin-header">
                    <h4>${admin.user_name}</h4>
                    <span class="admin-email">${admin.user_email}</span>
                </div>
                <div class="admin-groups">
                    <strong>Grupos gerenciados:</strong>
                    <div class="groups-list">
                        ${admin.group_names.map(name => `<span class="group-tag">${name}</span>`).join('')}
                    </div>
                </div>
                <div class="admin-meta">
                    <small>Designado em: ${new Date(admin.created_at).toLocaleDateString('pt-BR')}</small>
                </div>
                <div class="admin-actions">
                    <button class="btn outline edit-admin" data-user-id="${admin.user_id}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn danger delete-admin" data-user-id="${admin.user_id}">
                        <i class="fas fa-trash"></i> Remover
                    </button>
                </div>
            </div>
        `).join('');

        this.attachGroupAdminActionListeners();
    }

    attachGroupActionListeners() {
        document.querySelectorAll('.edit-group').forEach(button => {
            button.addEventListener('click', (e) => {
                const groupId = e.target.closest('button').dataset.groupId;
                const group = this.groups.find(g => g.id == groupId);
                if (group) this.openEditGroupModal(group);
            });
        });

        document.querySelectorAll('.delete-group').forEach(button => {
            button.addEventListener('click', (e) => {
                const groupId = e.target.closest('button').dataset.groupId;
                this.deleteGroup(groupId);
            });
        });
    }

    attachGroupAdminActionListeners() {
        document.querySelectorAll('.edit-admin').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.target.closest('button').dataset.userId;
                const admin = this.groupAdmins.find(a => a.user_id === userId);
                if (admin) this.openEditGroupAdminModal(admin);
            });
        });

        document.querySelectorAll('.delete-admin').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.target.closest('button').dataset.userId;
                this.deleteGroupAdmin(userId);
            });
        });
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        // Implementação similar à do GroupAdminUsersManager
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
    }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new GroupManagement();
});
