// token-recovery.js - Sistema de recuperação de token malformado
class TokenRecoveryManager {
    constructor() {
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.setupTokenValidation();
    }

    setupTokenValidation() {
        // Interceptar todas as requisições para verificar tokens malformados
        this.interceptFetch();
        
        // Validar token ao carregar a página
        document.addEventListener('DOMContentLoaded', () => {
            this.validateStoredToken();
        });
    }

    interceptFetch() {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            try {
                // Verificar se é uma requisição para a API
                const url = args[0];
                if (typeof url === 'string' && url.includes('/api/')) {
                    await this.ensureValidToken();
                }
                return originalFetch(...args);
            } catch (error) {
                console.error('Erro no fetch interceptado:', error);
                throw error;
            }
        };
    }

    async validateStoredToken() {
        const token = localStorage.getItem('token');
        if (!token) return;

        if (this.isTokenMalformed(token)) {
            console.warn('Token malformado encontrado, tentando recuperar...');
            await this.recoverToken();
        }
    }

    isTokenMalformed(token) {
        if (!token || typeof token !== 'string') return true;
        
        try {
            const parts = token.split('.');
            // Um JWT válido deve ter exatamente 3 partes
            if (parts.length !== 3) {
                console.error('Token malformado: número incorreto de segmentos', parts.length);
                return true;
            }

            // Verificar se cada parte pode ser decodificada
            try {
                JSON.parse(atob(parts[0])); // Header
                JSON.parse(atob(parts[1])); // Payload
                // A terceira parte é a assinatura, não precisamos decodificar
            } catch (e) {
                console.error('Token malformado: partes não podem ser decodificadas');
                return true;
            }

            return false;
        } catch (error) {
            console.error('Erro ao validar estrutura do token:', error);
            return true;
        }
    }

    async recoverToken() {
        console.log('Iniciando recuperação de token...');
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`Tentativa de recuperação ${attempt} de ${this.maxRetries}`);
                
                // Tentar obter a sessão atual do Supabase
                const { data: { session }, error } = await supabase.auth.getSession();
                
                if (error) {
                    console.error('Erro ao obter sessão:', error);
                    throw error;
                }

                if (session && session.access_token) {
                    const newToken = session.access_token;
                    
                    if (!this.isTokenMalformed(newToken)) {
                        console.log('Token recuperado com sucesso');
                        localStorage.setItem('token', newToken);
                        
                        // Limpar caches
                        if (typeof clearUserProfileCache === 'function') {
                            clearUserProfileCache();
                        }
                        if (typeof clearAllCaches === 'function') {
                            clearAllCaches();
                        }
                        
                        // Notificar sucesso
                        this.showRecoverySuccess();
                        return newToken;
                    } else {
                        console.error('Novo token também está malformado');
                    }
                }

                // Se chegou aqui, tentar renovar a sessão
                console.log('Tentando renovar sessão...');
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
                
                if (refreshError) {
                    console.error('Erro ao renovar sessão:', refreshError);
                    throw refreshError;
                }

                if (refreshData.session && refreshData.session.access_token) {
                    const refreshedToken = refreshData.session.access_token;
                    
                    if (!this.isTokenMalformed(refreshedToken)) {
                        console.log('Sessão renovada com sucesso');
                        localStorage.setItem('token', refreshedToken);
                        
                        // Limpar caches
                        if (typeof clearUserProfileCache === 'function') {
                            clearUserProfileCache();
                        }
                        
                        this.showRecoverySuccess();
                        return refreshedToken;
                    }
                }

                // Aguardar antes da próxima tentativa
                if (attempt < this.maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                }

            } catch (error) {
                console.error(`Tentativa ${attempt} falhou:`, error);
                
                if (attempt === this.maxRetries) {
                    console.error('Todas as tentativas de recuperação falharam');
                    await this.handleRecoveryFailure();
                    break;
                }
                
                // Aguardar antes da próxima tentativa
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
            }
        }
        
        return null;
    }

    async ensureValidToken() {
        const token = localStorage.getItem('token');
        
        if (!token) {
            console.warn('Nenhum token encontrado');
            return null;
        }

        if (this.isTokenMalformed(token)) {
            console.warn('Token malformado detectado, iniciando recuperação...');
            return await this.recoverToken();
        }

        return token;
    }

    async handleRecoveryFailure() {
        console.error('Falha na recuperação do token, redirecionando para login...');
        
        // Limpar tudo
        localStorage.removeItem('token');
        if (typeof clearAllCaches === 'function') {
            clearAllCaches();
        }
        
        // Tentar logout do Supabase
        try {
            await supabase.auth.signOut();
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
        }
        
        // Redirecionar para login
        this.showRecoveryError();
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 3000);
    }

    showRecoverySuccess() {
        this.showNotification('Sessão recuperada com sucesso!', 'success');
    }

    showRecoveryError() {
        this.showNotification('Erro ao recuperar sessão. Redirecionando para login...', 'error');
    }

    showNotification(message, type = 'info') {
        // Evitar múltiplas notificações
        const existingNotification = document.querySelector('.token-recovery-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = `token-recovery-notification notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 20px;
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            color: white;
            border-radius: 8px;
            z-index: 10001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInDown 0.3s ease;
            max-width: 90%;
            text-align: center;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
                <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

        // Adicionar estilos de animação se não existirem
        if (!document.querySelector('#recoveryNotificationStyles')) {
            const style = document.createElement('style');
            style.id = 'recoveryNotificationStyles';
            style.textContent = `
                @keyframes slideInDown {
                    from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
                @keyframes slideOutUp {
                    from { transform: translateX(-50%) translateY(0); opacity: 1; }
                    to { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // Remover após 5 segundos (3 segundos para erro)
        const duration = type === 'error' ? 3000 : 5000;
        setTimeout(() => {
            notification.style.animation = 'slideOutUp 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    // Método para forçar a validação do token em qualquer momento
    async forceTokenValidation() {
        return await this.ensureValidToken();
    }
}

// Inicializar gerenciador de recuperação
let tokenRecoveryManager;

document.addEventListener('DOMContentLoaded', () => {
    tokenRecoveryManager = new TokenRecoveryManager();
});

// Função global para verificação rápida de token
async function validateToken() {
    if (!tokenRecoveryManager) {
        console.error('TokenRecoveryManager não inicializado');
        return false;
    }
    
    const token = await tokenRecoveryManager.ensureValidToken();
    return !!token;
}

// Função global para forçar recuperação
async function recoverToken() {
    if (!tokenRecoveryManager) {
        console.error('TokenRecoveryManager não inicializado');
        return null;
    }
    
    return await tokenRecoveryManager.recoverToken();
}

// Exportar para uso global
window.TokenRecoveryManager = TokenRecoveryManager;
window.tokenRecoveryManager = tokenRecoveryManager;
window.validateToken = validateToken;
window.recoverToken = recoverToken;
