// user-menu.js - COMPLETO E FINAL

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
                return null;
            }
        }

        updateUI(userData) {
            console.log('🎨 Atualizando UI com dados reais:', userData);
            
            if (this.userName) {
                this.userName.textContent = userData.name || userData.email || 'Usuário';
                console.log('✏️ Nome definido como:', this.userName.textContent);
            }

            if (this.userRole) {
                const roleText = this.getRoleDisplayText(userData.role);
                this.userRole.textContent = roleText;
                console.log('🎯 Nível definido como:', roleText);
            }

            if (this.userAvatar) {
                if (userData.avatar) {
                    // Adiciona um timestamp para evitar problemas de cache do navegador
                    this.userAvatar.src = `${userData.avatar}?t=${new Date().getTime()}`;
                    this.userAvatar.onerror = () => this.setDefaultAvatar(userData);
                } else {
                    this.setDefaultAvatar(userData);
                }
                this.userAvatar.alt = `Avatar de ${userData.name || 'Usuário'}`;
                console.log('🖼️ Avatar definido');
            }

            localStorage.setItem('currentUser', JSON.stringify(userData));
            this.hideLoadingState();
            console.log('✅ UI atualizada com dados reais');
        }

        setDefaultAvatar(userData) {
            const name = userData.name || userData.email || 'U';
            const backgroundColor = userData.role === 'admin' ? 'ef4444' : '4f46e5';
            this.userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name )}&background=${backgroundColor}&color=fff&size=128&bold=true`;
            console.log('🖼️ Avatar padrão gerado para:', name);
        }

        getRoleDisplayText(role) {
            const roleMap = {'admin': 'Administrador', 'user': 'Usuário'};
            return roleMap[role] || 'Usuário';
        }

        setupEventListeners() {
            console.log('🎮 Configurando event listeners...');
            
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
                console.log('✅ Dropdown configurado');
            }

            if (this.logoutBtn) {
                this.logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleLogout();
                });
                console.log('✅ Logout configurado');
            }

            // ==================================================================
            // --- OUVE O EVENTO DE ATUALIZAÇÃO DE PERFIL ---
            console.log('👂 Configurando ouvinte para o evento [profileUpdated].');
            window.addEventListener('profileUpdated', (event) => {
                console.log('🎉 Evento [profileUpdated] recebido!', event.detail);
                // Simplesmente recarrega as informações do usuário do zero
                // para garantir que todos os dados (nome, foto, etc.) sejam atualizados.
                this.loadUserInfo(); 
            });
            // ==================================================================
            
            console.log('🎯 Todos os event listeners configurados');
        }

        toggleDropdown() {
            this.userDropdown.classList.toggle('active');
        }

        closeDropdown() {
            this.userDropdown.classList.remove('active');
        }

        async handleLogout() {
            if (confirm('Tem certeza que deseja sair?')) {
                if (typeof signOut === 'function') {
                    await signOut();
                }
            }
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
            setTimeout(() => { window.location.href = '/login.html'; }, 1000);
        }
    }

    if (document.getElementById('userMenuBtn')) {
        console.log('🚀 Iniciando UserMenu...');
        new UserMenu();
    } else {
        console.log('⏭️ UserMenu não inicializado - elementos não encontrados');
    }
});
