// user-menu.js - VERSÃO FINAL

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
            await this.loadUserInfo();
            this.setupEventListeners();
        }

        async loadUserInfo() {
            try {
                this.showLoadingState();
                
                // A função fetchUserProfile do auth.js já tem cache, então é seguro chamá-la.
                // Após uma atualização, o cache terá sido limpo.
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
                const roleMap = { 'admin': 'Administrador', 'user': 'Usuário' };
                this.userRole.textContent = roleMap[userData.role] || 'Usuário';
            }

            if (this.userAvatar) {
                const timestamp = `?t=${new Date().getTime()}`;
                if (userData.avatar_url) {
                    this.userAvatar.src = userData.avatar_url + timestamp;
                } else {
                    const name = userData.full_name || userData.email || 'U';
                    this.userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name )}&background=4f46e5&color=fff&bold=true`;
                }
            }
            this.hideLoadingState();
        }

        setupEventListeners() {
            if (this.userMenuBtn) {
                this.userMenuBtn.addEventListener('click', () => this.userDropdown.classList.toggle('active'));
                document.addEventListener('click', (e) => {
                    if (!this.userMenuBtn.contains(e.target)) this.userDropdown.classList.remove('active');
                });
            }

            if (this.logoutBtn) {
                this.logoutBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    if (confirm('Tem certeza que deseja sair?')) await signOut();
                });
            }

            // ==================================================================
            // --- OUVE O EVENTO DE ATUALIZAÇÃO DE PERFIL ---
            console.log('👂 Configurando ouvinte para o evento [profileUpdated].');
            window.addEventListener('profileUpdated', () => {
                console.log('🎉 Evento [profileUpdated] recebido! Recarregando informações do menu.');
                this.loadUserInfo(); 
            });
            // ==================================================================
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
