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
        }

        async loadUserInfo() {
            try {
                this.showLoadingState();
                console.log('📡 Buscando dados do usuário...');
                
                // Usa a função fetchUserProfile do auth.js que já está funcionando
                const userData = await this.fetchRealUserData();
                
                if (userData) {
                    this.updateUI(userData);
                    console.log('✅ Dados reais carregados:', userData);
                } else {
                    console.log('❌ Nenhum dado de usuário encontrado');
                    this.handleNoUserData();
                }
                
            } catch (error) {
                console.error('❌ Erro ao carregar informações:', error);
                this.showErrorState();
            }
        }

        async fetchRealUserData() {
            try {
                console.log('🌐 Buscando dados reais do usuário...');
                
                // Método 1: Tenta usar a função fetchUserProfile do auth.js
                if (typeof fetchUserProfile === 'function') {
                    console.log('📚 Usando fetchUserProfile do auth.js');
                    const profile = await fetchUserProfile();
                    if (profile) {
                        return {
                            name: profile.full_name,
                            email: profile.email,
                            role: profile.role,
                            avatar: profile.avatar_url,
                            permissions: profile.allowed_pages || []
                        };
                    }
                }
                
                // Método 2: Se não encontrar a função, faz a requisição diretamente
                console.log('🔧 Fazendo requisição direta para /api/users/me');
                const response = await authenticatedFetch('/api/users/me');
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const profile = await response.json();
                return {
                    name: profile.full_name,
                    email: profile.email,
                    role: profile.role,
                    avatar: profile.avatar_url,
                    permissions: profile.allowed_pages || []
                };
                
            } catch (error) {
                console.error('❌ Erro ao buscar dados reais:', error);
                
                // Método 3: Tenta dados do localStorage como último recurso
                const storedUser = localStorage.getItem('currentUser');
                if (storedUser) {
                    console.log('📦 Usando dados do localStorage');
                    return JSON.parse(storedUser);
                }
                
                return null;
            }
        }

        updateUI(userData) {
            console.log('🎨 Atualizando UI com dados reais:', userData);
            
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

            // Salvar dados reais para uso futuro
            localStorage.setItem('currentUser', JSON.stringify(userData));
            
            // Remover estado de loading
            this.hideLoadingState();
            
            console.log('✅ UI atualizada com dados reais');
        }

        setDefaultAvatar(userData) {
            const name = userData.name || userData.email || 'U';
            const backgroundColor = userData.role === 'admin' ? 'ef4444' : '4f46e5';
            this.userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${backgroundColor}&color=fff&size=128&bold=true`;
            console.log('🖼️ Avatar padrão gerado para:', name);
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
                    // Usa a função signOut do auth.js que já está funcionando
                    if (typeof signOut === 'function') {
                        await signOut();
                    } else {
                        await this.performLogout();
                    }
                    
                    this.showNotification('Logout realizado com sucesso', 'success');
                    
                } catch (error) {
                    console.error('Erro ao fazer logout:', error);
                    this.showNotification('Erro ao fazer logout', 'error');
                }
            }
        }

        async performLogout() {
            try {
                const response = await authenticatedFetch('/api/auth/logout', {
                    method: 'POST'
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
            console.log('❌ Estado de erro mostrado');
        }

        handleNoUserData() {
            if (this.userName) this.userName.textContent = 'Usuário Não Logado';
            if (this.userRole) this.userRole.textContent = '---';
            this.showNotification('Usuário não autenticado', 'warning');
            
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

    // Inicializar apenas se os elementos existirem
    if (document.getElementById('userMenuBtn')) {
        console.log('🚀 Iniciando UserMenu...');
        new UserMenu();
    } else {
        console.log('⏭️ UserMenu não inicializado - elementos não encontrados');
    }
});
