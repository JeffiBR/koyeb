// user-menu.js - VERSÃO ATUALIZADA COM NOVAS PERMISSÕES E CARGOS

document.addEventListener('DOMContentLoaded', function() {
    class UserMenu {
        constructor() {
            this.userMenuBtn = document.getElementById('userMenuBtn');
            this.userDropdown = document.getElementById('userDropdown');
            this.userAvatar = document.getElementById('userAvatar');
            this.userName = document.querySelector('.user-name');
            this.userRole = document.querySelector('.user-role');
            this.logoutBtn = document.getElementById('logoutBtn');
            
            // Novos elementos
            this.updatesBtn = document.querySelector('a[href="/updates.html"]');
            this.faqBtn = document.querySelector('a[href="/faq.html"]');
            this.maintenanceBtn = document.querySelector('a[href="/maintenance.html"]');
            
            this.init();
        }

        async init() {
            await this.loadUserInfo();
            this.setupEventListeners();
        }

        async loadUserInfo() {
            try {
                this.showLoadingState();
                
                const userData = await fetchUserProfile();
                
                if (userData) {
                    this.updateUI(userData);
                } else {
                    this.handleNoUserData();
                }
                
            } catch (error) {
                console.error('❌ Erro ao carregar informações do usuário:', error);
                this.showErrorState();
            }
        }

        updateUI(userData) {
            if (this.userName) {
                this.userName.textContent = userData.full_name || userData.email || 'Usuário';
            }

            if (this.userRole) {
                // ATUALIZADO: Mapeamento completo de cargos incluindo group_admin
                const roleMap = { 
                    'admin': 'Administrador', 
                    'group_admin': 'Subadministrador', 
                    'user': 'Usuário' 
                };
                this.userRole.textContent = roleMap[userData.role] || 'Usuário';
            }

            if (this.userAvatar) {
                const timestamp = `?t=${new Date().getTime()}`;
                if (userData.avatar_url) {
                    this.userAvatar.src = userData.avatar_url + timestamp;
                } else {
                    const name = userData.full_name || userData.email || 'U';
                    this.userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4f46e5&color=fff&bold=true`;
                }
            }
            
            // ATUALIZADO: Verificar permissões específicas para mostrar/ocultar itens do menu
            this.checkPermissions(userData);
            
            this.hideLoadingState();
        }

        // NOVO MÉTODO: Verificar permissões do usuário
        checkPermissions(userData) {
            // Se for admin ou group_admin, mostrar opções administrativas no menu lateral
            // (isso é tratado no menu.js, mas podemos adicionar lógica aqui se necessário)
            
            // Exemplo: Se quisermos esconder algumas opções do dropdown baseado em permissões
            // Por enquanto, todas as opções do dropdown são visíveis para todos os usuários logados
            console.log(`👤 Usuário ${userData.email} com role: ${userData.role}`);
            
            // Log adicional para debugging de permissões
            if (userData.allowed_pages && userData.allowed_pages.length > 0) {
                console.log(`📋 Páginas permitidas: ${userData.allowed_pages.join(', ')}`);
            }
        }

        setupEventListeners() {
            // Event listener existente para abrir/fechar menu
            if (this.userMenuBtn) {
                this.userMenuBtn.addEventListener('click', () => this.userDropdown.classList.toggle('active'));
                document.addEventListener('click', (e) => {
                    if (!this.userMenuBtn.contains(e.target)) this.userDropdown.classList.remove('active');
                });
            }

            // Event listener existente para logout
            if (this.logoutBtn) {
                this.logoutBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    if (confirm('Tem certeza que deseja sair?')) await signOut();
                });
            }

            // NOVOS EVENT LISTENERS PARA AS OPÇÕES ADICIONAIS
            if (this.updatesBtn) {
                this.updatesBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.userDropdown.classList.remove('active');
                    this.navigateToUpdates();
                });
            }

            if (this.faqBtn) {
                this.faqBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.userDropdown.classList.remove('active');
                    this.navigateToFAQ();
                });
            }

            if (this.maintenanceBtn) {
                this.maintenanceBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.userDropdown.classList.remove('active');
                    this.navigateToMaintenance();
                });
            }

            // ==================================================================
            // --- OUVE O EVENTO DE ATUALIZAÇÃO DE PERFIL ---
            console.log('👂 Configurando ouvinte para o evento [profileUpdated].');
            window.addEventListener('profileUpdated', () => {
                console.log('🎉 Evento [profileUpdated] recebido! Recarregando informações do menu.');
                this.loadUserInfo(); 
            });

            // NOVO: Ouvinte para evento de mudança de permissões
            window.addEventListener('permissionsUpdated', () => {
                console.log('🔄 Evento [permissionsUpdated] recebido! Recarregando informações do menu.');
                this.loadUserInfo();
            });
        }

        // NOVOS MÉTODOS PARA NAVEGAÇÃO
        navigateToUpdates() {
            console.log('Navegando para página de atualizações');
            window.location.href = '/updates.html';
        }

        navigateToFAQ() {
            console.log('Navegando para página de FAQ');
            window.location.href = '/faq.html';
        }

        navigateToMaintenance() {
            console.log('Navegando para página de manutenção');
            window.location.href = '/maintenance.html';
        }

        showLoadingState() {
            if (this.userName) this.userName.textContent = 'Carregando...';
            if (this.userRole) this.userRole.textContent = '...';
        }

        hideLoadingState() {
            // A UI é atualizada diretamente, não há estado de "loading" para remover.
        }

        showErrorState() {
            if (this.userName) this.userName.textContent = 'Erro';
            if (this.userRole) this.userRole.textContent = '---';
        }

        handleNoUserData() {
            // Se não houver dados, o routeGuard no auth.js já deve ter redirecionado para o login.
            console.log('Nenhum dado de usuário, redirecionamento para login deve ocorrer.');
        }
    }

    if (document.getElementById('userMenuBtn')) {
        new UserMenu();
    }
});
