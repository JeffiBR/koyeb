// menu.js - Sistema de menu dinâmico baseado em permissões
document.addEventListener('DOMContentLoaded', async function() {
    await initializeDynamicMenu();
});

async function initializeDynamicMenu() {
    try {
        const isAuthenticated = await checkAuth();
        if (!isAuthenticated) return;

        const userProfile = await fetchUserProfile();
        if (!userProfile) return;

        // Oculta o menu inicialmente
        const sidebar = document.getElementById('sidebarMenu');
        if (sidebar) {
            sidebar.style.display = 'none';
        }

        // Filtra e mostra apenas os itens permitidos
        await filterMenuItems(userProfile);
        
        // Mostra o menu após aplicar os filtros
        if (sidebar) {
            sidebar.style.display = 'block';
        }

    } catch (error) {
        console.error('Erro ao inicializar menu:', error);
    }
}

async function filterMenuItems(userProfile) {
    const menuItems = document.querySelectorAll('[data-required-permission]');
    
    menuItems.forEach(item => {
        const requiredPermission = item.getAttribute('data-required-permission');
        const hasAccess = userProfile.role === 'admin' || 
                         (userProfile.allowed_pages && userProfile.allowed_pages.includes(requiredPermission));
        
        if (!hasAccess) {
            item.style.display = 'none';
        } else {
            item.style.display = 'block';
            
            // Adiciona log de acesso quando o usuário clica no item do menu
            const link = item.querySelector('a');
            if (link) {
                link.addEventListener('click', async function(e) {
                    try {
                        await authenticatedFetch('/api/log-page-access', {
                            method: 'POST',
                            body: JSON.stringify({ page_key: requiredPermission })
                        });
                    } catch (error) {
                        console.error('Erro ao registrar acesso:', error);
                    }
                });
            }
        }
    });

    // Esconde seções vazias
    hideEmptySections();
}

function hideEmptySections() {
    const sections = document.querySelectorAll('.nav-section');
    
    sections.forEach(section => {
        const visibleItems = section.querySelectorAll('li[data-required-permission]');
        let hasVisibleItems = false;
        
        visibleItems.forEach(item => {
            if (item.style.display !== 'none') {
                hasVisibleItems = true;
            }
        });
        
        // Se não há itens visíveis, esconde a seção inteira
        if (!hasVisibleItems) {
            section.style.display = 'none';
        }
    });
}

// Função para mostrar mensagem de acesso expirado
function showAccessExpiredMessage() {
    // Remove mensagens existentes
    const existingMessage = document.getElementById('accessExpiredMessage');
    if (existingMessage) {
        existingMessage.remove();
    }

    const messageHTML = `
        <div id="accessExpiredMessage" class="access-expired-overlay">
            <div class="access-expired-modal">
                <div class="access-expired-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h2>Acesso Expirado</h2>
                <p>Seu acesso à plataforma expirou. Para continuar utilizando os serviços, entre em contato com nosso suporte.</p>
                <div class="access-expired-contact">
                    <p><strong>Contato do Suporte:</strong></p>
                    <p>📧 Email: djaxelf22@gmail.com</p>
                    <p>📞 Telefone: (82) 99915-8412</p>
                    <p>🕒 Horário: Segunda a Sexta, 8h às 18h</p>
                </div>
                <div class="access-expired-actions">
                    <button onclick="window.signOut()" class="btn btn-secondary">
                        <i class="fas fa-sign-out-alt"></i> Fazer Logout
                    </button>
                    <button onclick="location.reload()" class="btn btn-primary">
                        <i class="fas fa-sync-alt"></i> Tentar Novamente
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', messageHTML);
}

// Configura tratamento global de erros
function setupGlobalErrorHandling() {
    // Intercepta fetch requests para tratar erro 403 (acesso expirado)
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch(...args);
            
            if (response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData.detail && errorData.detail.includes('acesso expirou')) {
                    showAccessExpiredMessage();
                    throw new Error('ACCESS_EXPIRED');
                }
            }
            
            return response;
        } catch (error) {
            if (error.message === 'ACCESS_EXPIRED') {
                throw error;
            }
            throw error;
        }
    };

    // Intercepta erros não tratados
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason && event.reason.message === 'ACCESS_EXPIRED') {
            event.preventDefault();
        }
    });
}

// Inicializa o tratamento de erros
setupGlobalErrorHandling();

// Torna as funções globais
window.initializeDynamicMenu = initializeDynamicMenu;
window.showAccessExpiredMessage = showAccessExpiredMessage;
window.filterMenuItems = filterMenuItems;
