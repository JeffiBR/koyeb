// token-refresh.js - Sistema de renovação automática de token (compatível com auth.js)
class TokenRefreshManager {
    constructor() {
        this.refreshInProgress = false;
        this.refreshPromise = null;
        this.setupAutoRefresh();
    }

    setupAutoRefresh() {
        // Verificar token a cada 5 minutos
        setInterval(() => {
            this.checkAndRefreshToken();
        }, 5 * 60 * 1000);

        // Verificar token quando a página ganha foco
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkAndRefreshToken();
            }
        });
    }

    async checkAndRefreshToken() {
        const token = await this.getCurrentToken();
        if (!token) return;

        try {
            // Verificar se o token está expirado ou prestes a expirar
            if (this.isTokenExpiringSoon(token)) {
                await this.refreshToken();
            }
        } catch (error) {
            console.error('Erro ao verificar token:', error);
        }
    }

    async getCurrentToken() {
        if (typeof getSession !== 'function') {
            console.error('getSession não está disponível');
            return null;
        }
        const session = await getSession();
        return session?.access_token;
    }

    isTokenExpiringSoon(token, thresholdMinutes = 10) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = payload.exp * 1000; // Converter para milissegundos
            const now = Date.now();
            const threshold = thresholdMinutes * 60 * 1000;
            return (exp - now) < threshold;
        } catch (error) {
            console.error('Erro ao verificar expiração do token:', error);
            return false;
        }
    }

    isTokenExpired(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = payload.exp * 1000;
            return Date.now() >= exp;
        } catch (error) {
            console.error('Erro ao verificar expiração do token:', error);
            return true;
        }
    }

    async refreshToken() {
        if (this.refreshInProgress) {
            return this.refreshPromise;
        }

        this.refreshInProgress = true;
        this.refreshPromise = this.performTokenRefresh();

        try {
            await this.refreshPromise;
        } finally {
            this.refreshInProgress = false;
            this.refreshPromise = null;
        }
    }

    async performTokenRefresh() {
        try {
            const currentToken = await this.getCurrentToken();
            if (!currentToken) {
                throw new Error('Nenhum token disponível para renovação');
            }

            // Usar a função do Supabase para renovar a sessão
            const { data, error } = await supabase.auth.refreshSession();
            
            if (error) {
                throw error;
            }

            if (data.session) {
                console.log('Token renovado com sucesso');
                // Limpar cache do perfil para forçar atualização
                if (typeof clearUserProfileCache === 'function') {
                    clearUserProfileCache();
                }
                return data.session;
            } else {
                throw new Error('Falha ao renovar token');
            }
        } catch (error) {
            console.error('Erro ao renovar token:', error);
            // Forçar logout se não conseguir renovar
            if (error.message.includes('invalid refresh token') || 
                error.message.includes('refresh token not found')) {
                console.log('Refresh token inválido, forçando logout...');
                if (typeof handleAuthError === 'function') {
                    handleAuthError();
                }
            }
            throw error;
        }
    }
}

// Inicializar gerenciador de token
let tokenRefreshManager;

document.addEventListener('DOMContentLoaded', () => {
    tokenRefreshManager = new TokenRefreshManager();
});

// Funções auxiliares
function isTokenExpired(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const exp = payload.exp * 1000;
        return Date.now() >= exp;
    } catch (error) {
        console.error('Erro ao verificar expiração do token:', error);
        return true;
    }
}

async function ensureValidToken() {
    const token = await tokenRefreshManager?.getCurrentToken();
    if (!token) {
        throw new Error('Token não encontrado');
    }

    if (tokenRefreshManager?.isTokenExpired(token)) {
        console.log('Token expirado, tentando renovar...');
        await tokenRefreshManager.refreshToken();
    } else if (tokenRefreshManager?.isTokenExpiringSoon(token)) {
        console.log('Token prestes a expirar, renovando...');
        await tokenRefreshManager.refreshToken();
    }
}

// Exportar para uso global
window.TokenRefreshManager = TokenRefreshManager;
window.tokenRefreshManager = tokenRefreshManager;
window.isTokenExpired = isTokenExpired;
window.ensureValidToken = ensureValidToken;
