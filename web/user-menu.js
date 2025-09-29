// user-menu.js
document.addEventListener('DOMContentLoaded', function() {
    class UserMenu {
        constructor() {
            this.userMenuBtn = document.getElementById('userMenuBtn');
            this.userDropdown = document.getElementById('userDropdown');
            this.userAvatar = document.getElementById('userAvatar');
            this.userName = document.querySelector('.user-name');
            this.userRole = document.querySelector('.user-role');
            this.logoutBtn = document.getElementById('logoutBtn');
            
            this.init();
        }

        async init() {
            console.log('🔧 Inicializando UserMenu...');
            await this.loadUserInfo();
            this.setupEventListeners();
            this.ensureMenuVisibility(); // Garantir menu sempre visível
        }

        async loadUserInfo() {
            try {
                this.showLoadingState();
                console.log('📡 Buscando dados do usuário...');
                
                const userData = await this.fetchUserData();
                console.log('✅ Dados recebidos:', userData);
                
                if (userData) {
                    this.updateUI(userData);
                } else {
                    console.log('❌ Nenhum dado recebido');
                    this.handleNoUserData();
                }
                
            } catch (error) {
                console.error('❌ Erro ao carregar informações:', error);
                this.showErrorState();
            }
        }

        async fetchUserData() {
            try {
                console.log('🌐 Chamando API /api/user/me...');
                const response = await authenticatedFetch('/api/user/me', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                console.log('📨 Status da resposta:', response.status);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const userData = await response.json();
                console.log('📊 Dados da API:', userData);
                return userData;
                
            } catch (error) {
                console.error('❌ Erro na API, usando fallback:', error);
                return await this.getFallbackUserData();
            }
        }

        async getFallbackUserData() {
            try {
                console.log('🔄 Tentando fallback...');
                
                // 1. Tentar do localStorage
                const storedUser = localStorage.getItem('currentUser');
                if (storedUser) {
                    console.log('📦 Usuário do localStorage:', storedUser);
                    return JSON.parse(storedUser);
                }
                
                // 2. Tentar do token Supabase
                const token = localStorage.getItem('supabase.auth.token');
                if (token) {
                    console.log('🔑 Token encontrado, extraindo dados...');
                    try {
                        const parsedToken = JSON.parse(token);
                        if (parsedToken?.access_token) {
                            const payload = JSON.parse(atob(parsedToken.access_token.split('.')[1]));
                            console.log('📋 Payload do token:', payload);
                            
                            const userData = {
                                id: payload.sub,
                                email: payload.email,
                                name: payload.user_metadata?.name || payload.email?.split('@')[0] || 'Usuário Teste',
                                role: payload.user_metadata?.role || 'user',
                                avatar: payload.user_metadata?.avatar_url || null,
                                permissions: ['search', 'compare', 'dashboard']
                            };
                            
                            console.log('👤 Dados do token:', userData);
                            return userData;
                        }
                    } catch (tokenError) {
                        console.error('❌ Erro ao decodificar token:', tokenError);
                    }
                }
                
                // 3. Fallback final com dados de exemplo
                console.log('🎭 Usando dados de exemplo');
                return {
                    name: 'João Silva',
                    email: 'joao@empresa.com',
                    role: 'admin', // Mudar para 'user' para testar diferentes níveis
                    avatar: null,
                    permissions: ['search', 'compare', 'dashboard', 'coleta', 'collections', 'markets', 'users']
                };
                
            } catch (error) {
                console.error('❌ Erro no fallback:', error);
                return null;
            }
        }

        updateUI(userData) {
            console.log('🎨 Atualizando UI com:', userData);
            
            // Nome do usuário
            if (this.userName) {
                this.userName.textContent = userData.name || userData.email || 'Usuário';
                console.log('✏️ Nome definido como:', this.userName.textContent);
            }

            // Nível/função do usuário
            if (this.userRole) {
                const roleText = this.getRoleDisplayText(userData.role);
                this.userRole.textContent = roleText;
                console.log('🎯 Nível definido como:', roleText);
                
                // Adicionar classe para estilização diferenciada
                this.userRole.className = 'user-role';
                if (userData.role === 'admin') {
                    this.userRole.classList.add('admin-role');
                } else if (userData.role === 'moderator') {
                    this.userRole.classList.add('moderator-role');
                }
            }

            // Avatar do usuário
            if (this.userAvatar) {
                if (userData.avatar) {
                    this.userAvatar.src = userData.avatar;
                    this.userAvatar.onerror = () => this.setDefaultAvatar(userData);
                } else {
                    this.setDefaultAvatar(userData);
                }
                
                this.userAvatar.alt = `Avatar de ${userData.name || 'Usuário'}`;
                console.log('🖼️ Avatar definido');
            }

            // Salvar dados para uso futuro
            localStorage.setItem('currentUser', JSON.stringify(userData));
            
            // Remover estado de loading
            this.hideLoadingState();
            
            console.log('✅ UI atualizada com sucesso');
        }

        setDefaultAvatar(userData) {
            const name = userData.name || userData.email || 'U';
            const backgroundColor = userData.role === 'admin' ? 'ef4444' : '4f46e5';
            this.userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${backgroundColor}&color=fff&size=128&bold=true`;
            console.log('🖼️ Avatar padrão gerado');
        }

        getRoleDisplayText(role) {
            const roleMap = {
                'admin': 'Administrador',
                'moderator': 'Moderador', 
                'user': 'Usuário',
                'viewer': 'Visualizador'
            };
            
            return roleMap[role] || 'Usuário';
        }

        ensureMenuVisibility() {
            console.log('👁️ Garantindo visibilidade do menu...');
            
            // Garantir que todos os itens do menu estejam visíveis
            const allMenuItems = document.querySelectorAll('.sidebar-nav li');
            allMenuItems.forEach(item => {
                item.style.display = 'flex';
            });
            
            console.log('✅ Menu garantido como visível');
        }

        setupEventListeners() {
            console.log('🎮 Configurando event listeners...');
            
            // Toggle do dropdown
            if (this.userMenuBtn && this.userDropdown) {
                this.userMenuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleDropdown();
                });

                document.addEventListener('click', (e) => {
                    if (!this.userMenuBtn.contains(e.target) && !this.userDropdown.contains(e.target)) {
                        this.closeDropdown();
                    }
                });

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        this.closeDropdown();
                    }
                });
                
                console.log('✅ Dropdown configurado');
            }

            // Logout
            if (this.logoutBtn) {
                this.logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleLogout();
                });
                console.log('✅ Logout configurado');
            }
            
            console.log('🎯 Todos os event listeners configurados');
        }

        toggleDropdown() {
            this.userDropdown.classList.toggle('active');
            
            const chevron = this.userMenuBtn.querySelector('.fa-chevron-down');
            if (chevron) {
                chevron.style.transform = this.userDropdown.classList.contains('active') 
                    ? 'rotate(180deg)' 
                    : 'rotate(0deg)';
            }
        }

        closeDropdown() {
            this.userDropdown.classList.remove('active');
            
            const chevron = this.userMenuBtn.querySelector('.fa-chevron-down');
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
            }
        }

        async handleLogout() {
            if (confirm('Tem certeza que deseja sair?')) {
                try {
                    await this.performLogout();
                    this.showNotification('Logout realizado com sucesso', 'success');
                    
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 1500);
                    
                } catch (error) {
                    console.error('Erro ao fazer logout:', error);
                    this.showNotification('Erro ao fazer logout', 'error');
                }
            }
        }

        async performLogout() {
            try {
                const response = await authenticatedFetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                this.clearLocalData();
                
            } catch (error) {
                console.error('Erro na API de logout:', error);
                this.clearLocalData();
            }
        }

        clearLocalData() {
            localStorage.removeItem('supabase.auth.token');
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            sessionStorage.clear();
            console.log('🧹 Dados locais limpos');
        }

        showLoadingState() {
            if (this.userName) this.userName.textContent = 'Carregando...';
            if (this.userRole) this.userRole.textContent = '...';
            console.log('⏳ Mostrando estado de loading');
        }

        hideLoadingState() {
            console.log('✅ Loading finalizado');
        }

        showErrorState() {
            if (this.userName) this.userName.textContent = 'Erro ao carregar';
            if (this.userRole) this.userRole.textContent = '---';
            this.setDefaultAvatar({ name: 'Erro', role: 'user' });
            this.ensureMenuVisibility();
            console.log('❌ Estado de erro mostrado');
        }

        handleNoUserData() {
            if (this.userName) this.userName.textContent = 'Usuário Não Logado';
            if (this.userRole) this.userRole.textContent = '---';
            this.showNotification('Usuário não autenticado', 'warning');
            this.ensureMenuVisibility();
            
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        }

        showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.innerHTML = `
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => notification.classList.add('show'), 10);
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, 4000);
        }

        getNotificationIcon(type) {
            const icons = {
                'success': 'check-circle',
                'error': 'exclamation-circle',
                'warning': 'exclamation-triangle',
                'info': 'info-circle'
            };
            return icons[type] || 'info-circle';
        }
    }

    // Inicializar
    console.log('🚀 Iniciando UserMenu...');
    new UserMenu();
});
