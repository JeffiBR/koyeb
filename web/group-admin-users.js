// group-admin-users.js - Gerenciamento de Usuários por Subadministrador - COMPLETO
// VERSÃO COM LAYOUT COMPACTO

class GroupAdminUsersManager {
    constructor() {
        this.currentUser = null;
        this.managedGroups = [];
        this.groupUsers = [];
        this.availablePages = [
            'search', 'compare', 'dashboard', 'baskets', 
            'coleta', 'collections', 'product_log', 'user_logs', 'prune',
            'markets'
        ];
        this.pageLabels = {
            'search': 'Busca',
            'compare': 'Comparador',
            'dashboard': 'Dashboard',
            'baskets': 'Cestas Básicas',
            'coleta': 'Coleta de Dados',
            'collections': 'Histórico de Coletas',
            'product_log': 'Log de Produtos',
            'user_logs': 'Logs de Usuários',
            'prune': 'Limpeza de Dados',
            'markets': 'Gerenciar Mercados'
        };
        this.init();
    }

    async init() {
        console.log('Inicializando GroupAdminUsersManager...');
        try {
            await this.checkAuth();
            console.log('Auth verificado, carregando dados...');
            await this.loadUserData();
            console.log('Dados carregados, carregando usuários...');
            await this.loadGroupUsers();
            console.log('Usuários carregados, configurando UI...');
            this.setupEventListeners();
            this.setupResponsiveLayout();
            this.renderAllowedPagesCheckboxes();
            this.updateGroupInfo();
            console.log('Inicialização completa');
        } catch (error) {
            console.error('Erro na inicialização:', error);
            this.showError('Erro ao inicializar: ' + error.message);
        }
    }

    setupResponsiveLayout() {
        const handleResize = () => {
            const isMobile = window.innerWidth < 768;
            document.body.classList.toggle('mobile-layout', isMobile);
        };

        window.addEventListener('resize', handleResize);
        handleResize(); // Chamar inicialmente
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

            this.updateUserInfo(this.currentUser);

            // Verificar se é admin ou subadmin
            if (this.currentUser.role !== 'admin') {
                // Para não-admins, verificar se tem grupos gerenciados
                if (!this.currentUser.managed_groups || this.currentUser.managed_groups.length === 0) {
                    this.showError('Acesso negado. Você não tem permissões de subadministrador.');
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 3000);
                    return;
                }
            }

        } catch (error) {
            console.error('Erro de autenticação:', error);
            window.location.href = 'login.html';
        }
    }

    async loadUserData() {
        try {
            // Se for admin, não precisa carregar grupos específicos
            if (this.currentUser.role === 'admin') {
                this.managedGroups = [{ group_id: 'admin', grupo_nome: 'Todos os Grupos', grupo_dias_acesso: 365 }];
                return;
            }

            // Para subadmins, carregar grupos gerenciados
            const response = await authenticatedFetch('/api/my-groups-detailed');
            
            if (response.ok) {
                this.managedGroups = await response.json();
                console.log('Grupos carregados:', this.managedGroups);
                
                // Verificar se há grupos
                if (this.managedGroups.length === 0) {
                    this.showError('Nenhum grupo designado para gerenciamento.');
                    return;
                }
            } else {
                const errorText = await response.text();
                console.error('Erro na resposta:', response.status, errorText);
                throw new Error('Falha ao carregar grupos');
            }

        } catch (error) {
            console.error('Erro ao carregar dados do usuário:', error);
            this.showError('Erro ao carregar informações do grupo: ' + error.message);
        }
    }

    async loadGroupUsers() {
        try {
            let response;
            
            if (this.currentUser.role === 'admin') {
                // Admin pode ver todos os usuários
                response = await authenticatedFetch('/api/users');
            } else if (this.managedGroups.length > 0) {
                // Subadmin vê usuários do seu primeiro grupo
                const groupId = this.managedGroups[0].group_id;
                response = await authenticatedFetch(`/api/group-admin/users?group_id=${groupId}`);
            } else {
                this.showError('Nenhum grupo disponível para carregar usuários.');
                return;
            }

            if (response.ok) {
                this.groupUsers = await response.json();
                this.renderGroupUsers();
            } else {
                throw new Error('Falha ao carregar usuários do grupo');
            }
        } catch (error) {
            console.error('Erro ao carregar usuários do grupo:', error);
            this.showError('Erro ao carregar lista de usuários: ' + error.message);
        }
    }

    updateUserInfo(userData) {
        const userNameElement = document.getElementById('userName');
        const userRoleElement = document.getElementById('userRole');
        
        if (userNameElement) {
            userNameElement.textContent = userData.full_name || 'Usuário';
        }
        
        if (userRoleElement) {
            userRoleElement.textContent = this.formatRole(userData.role);
        }
        
        if (userData.avatar_url) {
            document.getElementById('userAvatar').src = userData.avatar_url;
        } else {
            const userName = userData.full_name || 'U';
            document.getElementById('userAvatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=4f46e5&color=fff`;
        }
    }

    formatRole(role) {
        const roles = {
            'admin': 'Administrador',
            'user': 'Usuário',
            'group_admin': 'Subadministrador'
        };
        return roles[role] || role;
    }

    updateGroupInfo() {
        if (this.managedGroups.length === 0) {
            document.getElementById('currentGroupInfo').innerHTML = '<span style="color: #ef4444;">Nenhum grupo designado</span>';
            document.getElementById('activeUsersCount').innerHTML = '<span style="color: #ef4444;">N/A</span>';
            return;
        }

        const group = this.managedGroups[0];
        document.getElementById('currentGroupInfo').innerHTML = `
            <strong>${group.grupo_nome}</strong><br>
            <small>${group.grupo_dias_acesso} dias de acesso</small>
        `;

        const activeUsers = this.groupUsers.filter(user => this.isUserActive(user.data_expiracao));
        document.getElementById('activeUsersCount').innerHTML = `
            <strong>${activeUsers.length}</strong> de <strong>${this.groupUsers.length}</strong> usuários ativos
        `;

        document.getElementById('groupDescription').textContent = 
            `Crie e gerencie usuários no grupo "${group.grupo_nome}".`;
    }

    renderAllowedPagesCheckboxes(containerId = 'allowedPagesContainer', currentPages = []) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';

        this.availablePages.forEach(page => {
            const checkboxId = `${containerId}_${page}`;
            const isChecked = currentPages.includes(page);
            
            const checkboxHTML = `
                <div class="page-checkbox">
                    <input type="checkbox" id="${checkboxId}" value="${page}" ${isChecked ? 'checked' : ''}>
                    <label for="${checkboxId}" class="page-checkbox-label">
                        <i class="fas fa-${this.getPageIcon(page)}"></i>
                        ${this.pageLabels[page] || page}
                    </label>
                </div>
            `;
            container.innerHTML += checkboxHTML;
        });
    }

    getPageIcon(page) {
        const icons = {
            'search': 'search',
            'compare': 'chart-bar',
            'dashboard': 'chart-line',
            'baskets': 'shopping-basket',
            'coleta': 'database',
            'collections': 'history',
            'product_log': 'file-alt',
            'user_logs': 'user-clock',
            'prune': 'broom',
            'markets': 'store'
        };
        return icons[page] || 'circle';
    }

    setupEventListeners() {
        // Criar usuário
        const createBtn = document.getElementById('createUserBtn');
        if (createBtn) {
            createBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.createUser();
            });
        }

        // Atualizar lista
        const refreshBtn = document.getElementById('refreshUsersBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadGroupUsers();
            });
        }

        // Formulário de editar usuário
        const editForm = document.getElementById('editUserForm');
        if (editForm) {
            editForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.updateUser();
            });
        }

        // Formulário de renovar acesso
        const renewForm = document.getElementById('renewAccessForm');
        if (renewForm) {
            renewForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.renewUserAccess();
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

        // Calcular nova data de expiração ao mudar dias
        const renewDays = document.getElementById('renewDays');
        if (renewDays) {
            renewDays.addEventListener('change', () => {
                this.updateRenewalPreview();
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }

        // Fechar modais com ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModals();
            }
        });
    }

    async createUser() {
        const name = document.getElementById('newUserName').value;
        const email = document.getElementById('newUserEmail').value;
        const password = document.getElementById('newUserPassword').value;

        if (!name || !email || !password) {
            this.showError('Por favor, preencha todos os campos obrigatórios');
            return;
        }

        if (password.length < 6) {
            this.showError('A senha deve ter no mínimo 6 caracteres');
            return;
        }

        const allowedPages = this.getSelectedPages('allowedPagesContainer');

        try {
            let response;
            
            if (this.currentUser.role === 'admin') {
                // Admin cria usuário normalmente
                response = await authenticatedFetch('/api/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: email,
                        password: password,
                        full_name: name,
                        role: 'user',
                        allowed_pages: allowedPages
                    })
                });
            } else if (this.managedGroups.length > 0) {
                // Subadmin cria usuário no grupo
                const groupId = this.managedGroups[0].group_id;
                response = await authenticatedFetch('/api/group-admin/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: email,
                        password: password,
                        full_name: name,
                        allowed_pages: allowedPages,
                        group_id: groupId
                    })
                });
            } else {
                this.showError('Nenhum grupo disponível para criar usuário');
                return;
            }

            if (response.ok) {
                this.showSuccess('Usuário criado com sucesso!');
                // Limpar formulário
                document.getElementById('newUserName').value = '';
                document.getElementById('newUserEmail').value = '';
                document.getElementById('newUserPassword').value = '';
                this.renderAllowedPagesCheckboxes('allowedPagesContainer', []);
                
                await this.loadGroupUsers();
                this.updateGroupInfo();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao criar usuário');
            }
        } catch (error) {
            console.error('Erro ao criar usuário:', error);
            this.showError('Erro ao criar usuário: ' + error.message);
        }
    }

    getSelectedPages(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    openViewPermissionsModal(user) {
        document.getElementById('viewUserName').textContent = user.full_name || 'N/A';
        document.getElementById('viewUserEmail').textContent = user.email || 'N/A';
        document.getElementById('viewUserExpiration').textContent = 
            user.data_expiracao ? new Date(user.data_expiracao).toLocaleDateString('pt-BR') : 'N/A';
        
        const permissionsContainer = document.getElementById('viewUserPermissions');
        permissionsContainer.innerHTML = '';
        
        this.availablePages.forEach(page => {
            const hasPermission = user.allowed_pages && user.allowed_pages.includes(page);
            const permissionItem = document.createElement('div');
            permissionItem.className = `permission-item ${hasPermission ? 'active' : 'inactive'}`;
            permissionItem.innerHTML = `
                <i class="fas fa-${this.getPageIcon(page)}"></i>
                <span>${this.pageLabels[page] || page}</span>
                ${hasPermission ? '<i class="fas fa-check" style="margin-left: auto; color: var(--success);"></i>' : ''}
            `;
            permissionsContainer.appendChild(permissionItem);
        });
        
        document.getElementById('viewPermissionsModal').classList.add('active');
    }

    openEditModal(user) {
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUserName').value = user.full_name || '';
        document.getElementById('editUserEmail').value = user.email || '';
        document.getElementById('editUserExpiration').value = user.data_expiracao || '';

        this.renderAllowedPagesCheckboxes('editAllowedPagesContainer', user.allowed_pages || []);

        document.getElementById('editUserModal').classList.add('active');
    }

    openRenewModal(user) {
        document.getElementById('renewUserId').value = user.id;
        this.updateRenewalPreview();
        document.getElementById('renewAccessModal').classList.add('active');
    }

    updateRenewalPreview() {
        const days = parseInt(document.getElementById('renewDays').value);
        const newDate = new Date();
        newDate.setDate(newDate.getDate() + days);
        
        document.getElementById('newExpirationDate').textContent = 
            newDate.toLocaleDateString('pt-BR');
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    async updateUser() {
        const userId = document.getElementById('editUserId').value;
        const name = document.getElementById('editUserName').value;
        const email = document.getElementById('editUserEmail').value;
        const expiration = document.getElementById('editUserExpiration').value;
        const allowedPages = this.getSelectedPages('editAllowedPagesContainer');

        if (!name || !email || !expiration) {
            this.showError('Por favor, preencha todos os campos obrigatórios');
            return;
        }

        try {
            let response;
            
            if (this.currentUser.role === 'admin') {
                response = await authenticatedFetch(`/api/users/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        full_name: name,
                        role: 'user',
                        allowed_pages: allowedPages
                    })
                });
            } else {
                response = await authenticatedFetch(`/api/group-admin/users/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        full_name: name,
                        email: email,
                        allowed_pages: allowedPages,
                        data_expiracao: expiration
                    })
                });
            }

            if (response.ok) {
                this.showSuccess('Usuário atualizado com sucesso!');
                this.closeModals();
                await this.loadGroupUsers();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao atualizar usuário');
            }
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
            this.showError('Erro ao atualizar usuário: ' + error.message);
        }
    }

    async renewUserAccess() {
        const userId = document.getElementById('renewUserId').value;
        const days = parseInt(document.getElementById('renewDays').value);

        try {
            const response = await authenticatedFetch(`/api/group-admin/users/${userId}/renew`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    dias_adicionais: days
                })
            });

            if (response.ok) {
                this.showSuccess('Acesso renovado com sucesso!');
                this.closeModals();
                await this.loadGroupUsers();
                this.updateGroupInfo();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao renovar acesso');
            }
        } catch (error) {
            console.error('Erro ao renovar acesso:', error);
            this.showError('Erro ao renovar acesso: ' + error.message);
        }
    }

    async deleteUser(userId) {
        if (!confirm('Tem certeza que deseja remover este usuário? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            let response;
            
            if (this.currentUser.role === 'admin') {
                response = await authenticatedFetch(`/api/users/${userId}`, {
                    method: 'DELETE'
                });
            } else {
                response = await authenticatedFetch(`/api/group-admin/users/${userId}`, {
                    method: 'DELETE'
                });
            }

            if (response.ok) {
                this.showSuccess('Usuário removido com sucesso!');
                await this.loadGroupUsers();
                this.updateGroupInfo();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao remover usuário');
            }
        } catch (error) {
            console.error('Erro ao remover usuário:', error);
            this.showError('Erro ao remover usuário: ' + error.message);
        }
    }

    isUserActive(expirationDate) {
        if (!expirationDate) return false;
        const today = new Date();
        const expDate = new Date(expirationDate);
        return expDate >= today;
    }

    getUserStatus(expirationDate) {
        if (!expirationDate) return 'expired';
        
        const today = new Date();
        const expDate = new Date(expirationDate);
        const daysUntilExpiration = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiration < 0) return 'expired';
        if (daysUntilExpiration <= 7) return 'warning';
        return 'active';
    }

    getStatusText(status) {
        const statusTexts = {
            'active': 'Ativo',
            'warning': 'Expira em breve',
            'expired': 'Expirado'
        };
        return statusTexts[status] || 'Desconhecido';
    }

    renderGroupUsers() {
        const tbody = document.querySelector('#groupUsersTable tbody');
        if (!tbody) return;
        
        if (this.groupUsers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <i class="fas fa-users"></i>
                        <h4>Nenhum usuário no grupo</h4>
                        <p>Comece criando o primeiro usuário</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.groupUsers.map(user => {
            const status = this.getUserStatus(user.data_expiracao);
            const statusClass = `status-${status}`;
            const statusText = this.getStatusText(status);

            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="user-avatar-small">
                                ${user.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div>
                                <strong>${user.full_name || 'N/A'}</strong>
                                <br>
                                <small style="color: var(--muted-dark); font-size: 0.75rem;">${user.id}</small>
                            </div>
                        </div>
                    </td>
                    <td>${user.email || 'N/A'}</td>
                    <td>
                        <div class="pages-badges">
                            ${(user.allowed_pages || []).slice(0, 3).map(page => `
                                <span class="page-badge">
                                    ${this.pageLabels[page] || page}
                                </span>
                            `).join('')}
                            ${user.allowed_pages && user.allowed_pages.length > 3 ? 
                                `<span class="page-badge" style="background: rgba(107, 114, 128, 0.1); color: #6b7280;">
                                    +${user.allowed_pages.length - 3}
                                </span>` : ''}
                            ${user.allowed_pages && user.allowed_pages.length === 0 ? 
                                '<span class="page-badge" style="background: rgba(107, 114, 128, 0.1); color: #6b7280;">Nenhuma</span>' : ''}
                        </div>
                    </td>
                    <td>${user.data_expiracao ? new Date(user.data_expiracao).toLocaleDateString('pt-BR') : 'N/A'}</td>
                    <td>
                        <span class="user-status ${statusClass}">
                            <i class="fas fa-circle"></i>
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <div class="quick-actions">
                            <button class="quick-action-btn info view-permissions" data-user-id="${user.id}" title="Ver Permissões">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="quick-action-btn primary edit-user" data-user-id="${user.id}" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="quick-action-btn warning renew-user" data-user-id="${user.id}" title="Renovar Acesso">
                                <i class="fas fa-redo"></i>
                            </button>
                            <button class="quick-action-btn danger delete-user" data-user-id="${user.id}" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Adicionar event listeners aos botões
        this.attachUserActionListeners();
    }

    attachUserActionListeners() {
        const tbody = document.querySelector('#groupUsersTable tbody');
        if (!tbody) return;

        tbody.querySelectorAll('.view-permissions').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.target.closest('button').dataset.userId;
                const user = this.groupUsers.find(u => u.id === userId);
                if (user) this.openViewPermissionsModal(user);
            });
        });

        tbody.querySelectorAll('.edit-user').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.target.closest('button').dataset.userId;
                const user = this.groupUsers.find(u => u.id === userId);
                if (user) this.openEditModal(user);
            });
        });

        tbody.querySelectorAll('.renew-user').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.target.closest('button').dataset.userId;
                const user = this.groupUsers.find(u => u.id === userId);
                if (user) this.openRenewModal(user);
            });
        });

        tbody.querySelectorAll('.delete-user').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.target.closest('button').dataset.userId;
                this.deleteUser(userId);
            });
        });
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        // Remover notificações existentes
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

        // Remover automaticamente após 5 segundos
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

    logout() {
        if (typeof signOut === 'function') {
            signOut();
        } else {
            window.location.href = 'login.html';
        }
    }

    // Método para exportar dados dos usuários
    exportUsersData() {
        const data = this.groupUsers.map(user => ({
            'Nome': user.full_name,
            'Email': user.email,
            'ID': user.id,
            'Páginas Permitidas': (user.allowed_pages || []).map(page => this.pageLabels[page] || page).join(', '),
            'Data de Expiração': user.data_expiracao ? new Date(user.data_expiracao).toLocaleDateString('pt-BR') : 'N/A',
            'Status': this.getStatusText(this.getUserStatus(user.data_expiracao))
        }));

        const csv = this.convertToCSV(data);
        this.downloadCSV(csv, 'usuarios_grupo.csv');
    }

    convertToCSV(data) {
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(';')];
        
        for (const row of data) {
            const values = headers.map(header => {
                const escaped = ('' + row[header]).replace(/"/g, '""');
                return `"${escaped}"`;
            });
            csvRows.push(values.join(';'));
        }
        
        return csvRows.join('\n');
    }

    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Método para buscar usuários
    searchUsers(searchTerm) {
        if (!searchTerm) {
            this.renderGroupUsers();
            return;
        }

        const filteredUsers = this.groupUsers.filter(user => 
            user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.id?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        this.renderFilteredUsers(filteredUsers);
    }

    renderFilteredUsers(users) {
        const tbody = document.querySelector('#groupUsersTable tbody');
        if (!tbody) return;
        
        if (users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <i class="fas fa-search"></i>
                        <h4>Nenhum usuário encontrado</h4>
                        <p>Tente alterar os termos da busca</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = users.map(user => {
            const status = this.getUserStatus(user.data_expiracao);
            const statusClass = `status-${status}`;
            const statusText = this.getStatusText(status);

            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="user-avatar-small">
                                ${user.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div>
                                <strong>${user.full_name || 'N/A'}</strong>
                                <br>
                                <small style="color: var(--muted-dark); font-size: 0.75rem;">${user.id}</small>
                            </div>
                        </div>
                    </td>
                    <td>${user.email || 'N/A'}</td>
                    <td>
                        <div class="pages-badges">
                            ${(user.allowed_pages || []).slice(0, 3).map(page => `
                                <span class="page-badge">
                                    ${this.pageLabels[page] || page}
                                </span>
                            `).join('')}
                            ${user.allowed_pages && user.allowed_pages.length > 3 ? 
                                `<span class="page-badge" style="background: rgba(107, 114, 128, 0.1); color: #6b7280;">
                                    +${user.allowed_pages.length - 3}
                                </span>` : ''}
                            ${user.allowed_pages && user.allowed_pages.length === 0 ? 
                                '<span class="page-badge" style="background: rgba(107, 114, 128, 0.1); color: #6b7280;">Nenhuma</span>' : ''}
                        </div>
                    </td>
                    <td>${user.data_expiracao ? new Date(user.data_expiracao).toLocaleDateString('pt-BR') : 'N/A'}</td>
                    <td>
                        <span class="user-status ${statusClass}">
                            <i class="fas fa-circle"></i>
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <div class="quick-actions">
                            <button class="quick-action-btn info view-permissions" data-user-id="${user.id}" title="Ver Permissões">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="quick-action-btn primary edit-user" data-user-id="${user.id}" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="quick-action-btn warning renew-user" data-user-id="${user.id}" title="Renovar Acesso">
                                <i class="fas fa-redo"></i>
                            </button>
                            <button class="quick-action-btn danger delete-user" data-user-id="${user.id}" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.attachUserActionListeners();
    }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new GroupAdminUsersManager();
});
