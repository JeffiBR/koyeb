// route-guard.js - Sistema de proteção de rotas por permissões (COM RENOVAÇÃO DE TOKEN)
async function routeGuard(requiredPermission) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = 'login.html';
            return false;
        }

        // Verificar se o token está expirado
        if (typeof isTokenExpired === 'function' && isTokenExpired(token)) {
            console.log('Token expirado, redirecionando para login');
            if (typeof handleAuthError === 'function') {
                await handleAuthError();
            } else {
                localStorage.removeItem('token');
                window.location.href = 'login.html';
            }
            return false;
        }

        // Tentar renovar token se estiver prestes a expirar
        if (typeof ensureValidToken === 'function') {
            try {
                await ensureValidToken();
            } catch (error) {
                console.error('Erro ao renovar token:', error);
                if (typeof handleAuthError === 'function') {
                    await handleAuthError();
                } else {
                    localStorage.removeItem('token');
                    window.location.href = 'login.html';
                }
                return false;
            }
        }

        const response = await fetch('/api/users/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            if (typeof handleAuthError === 'function') {
                await handleAuthError();
            } else {
                localStorage.removeItem('token');
                window.location.href = 'login.html';
            }
            return false;
        }

        if (!response.ok) {
            throw new Error('Não autenticado');
        }

        const userData = await response.json();
        
        // Admin tem acesso a tudo
        if (userData.role === 'admin') {
            return true;
        }

        // Verificar se tem a permissão específica
        const allowedPages = userData.allowed_pages || [];
        if (!allowedPages.includes(requiredPermission)) {
            showRouteGuardError('Você não tem permissão para acessar esta página.');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 3000);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Erro na verificação de rota:', error);
        if (typeof handleAuthError === 'function') {
            await handleAuthError();
        } else {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        }
        return false;
    }
}

function showRouteGuardError(message) {
    // Criar elemento de notificação
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 20px;
        background: #ef4444;
        color: white;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-exclamation-circle"></i>
            <span>${message}</span>
        </div>
    `;

    // Adicionar estilos de animação se não existirem
    if (!document.querySelector('#routeGuardStyles')) {
        const style = document.createElement('style');
        style.id = 'routeGuardStyles';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Remover após 5 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Função para verificar expiração de acesso
async function checkAccessExpiration() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Verificar expiração do token primeiro
        if (typeof isTokenExpired === 'function' && isTokenExpired(token)) {
            if (typeof handleAuthError === 'function') {
                await handleAuthError();
            } else {
                localStorage.removeItem('token');
                showRouteGuardError('Sua sessão expirou. Faça login novamente.');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 3000);
            }
            return;
        }

        const response = await fetch('/api/users/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 403) {
            const errorData = await response.json();
            if (errorData.detail && errorData.detail.includes('acesso expirou')) {
                if (typeof handleAuthError === 'function') {
                    await handleAuthError();
                } else {
                    localStorage.removeItem('token');
                    showRouteGuardError('Seu acesso expirou. Entre em contato com o suporte.');
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 5000);
                }
            }
        } else if (response.status === 401) {
            if (typeof handleAuthError === 'function') {
                await handleAuthError();
            } else {
                localStorage.removeItem('token');
                showRouteGuardError('Sua sessão expirou. Faça login novamente.');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 3000);
            }
        }
    } catch (error) {
        console.error('Erro ao verificar acesso:', error);
    }
}
