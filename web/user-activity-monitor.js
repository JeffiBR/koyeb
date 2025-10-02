// user-activity-monitor.js
// Script para monitorar atividades dos usuários em todas as páginas

class UserActivityMonitor {
    constructor() {
        this.isInitialized = false;
        this.currentPage = '';
        this.userId = null;
        this.init();
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            // Aguardar um pouco para garantir que a autenticação esteja carregada
            await this.waitForAuth();
            
            this.currentPage = this.getCurrentPageKey();
            this.userId = this.getCurrentUserId();
            
            if (this.userId) {
                await this.logPageAccess(this.currentPage);
                this.setupActivityListeners();
            }
            
            this.isInitialized = true;
            console.log('UserActivityMonitor inicializado para:', this.currentPage);
        } catch (error) {
            console.error('Erro ao inicializar UserActivityMonitor:', error);
        }
    }

    waitForAuth() {
        return new Promise((resolve) => {
            const checkAuth = () => {
                const token = this.getToken();
                if (token) {
                    resolve(true);
                } else {
                    // Tentar novamente após 1 segundo
                    setTimeout(checkAuth, 1000);
                }
            };
            checkAuth();
        });
    }

    getCurrentPageKey() {
        const path = window.location.pathname;
        const pageMap = {
            '/': 'home',
            '/index.html': 'home',
            '/dashboard': 'dashboard',
            '/users': 'users',
            '/markets': 'markets',
            '/categories': 'categories',
            '/collections': 'collections',
            '/user-logs': 'user_logs',
            '/products-log': 'product_log',
            '/search': 'search',
            '/realtime-search': 'realtime_search',
            '/price-history': 'price_history',
            '/profile': 'profile',
            '/settings': 'settings'
        };
        
        return pageMap[path] || path.replace(/\//g, '_').replace('.html', '') || 'unknown_page';
    }

    getCurrentUserId() {
        try {
            const token = this.getToken();
            if (!token) return null;
            
            // Tentar extrair user_id do token (se for JWT)
            if (token.includes('.')) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    return payload.sub || payload.user_id || null;
                } catch (e) {
                    console.warn('Não foi possível extrair user_id do token');
                }
            }
            
            return null;
        } catch (error) {
            console.error('Erro ao obter user_id:', error);
            return null;
        }
    }

    getToken() {
        try {
            // Tentar obter o token do localStorage
            const authData = localStorage.getItem('supabase.auth.token');
            if (authData) {
                const parsed = JSON.parse(authData);
                return parsed.access_token || parsed;
            }
            
            // Fallback para sessionStorage
            return sessionStorage.getItem('supabase.auth.token') || '';
        } catch (error) {
            console.error('Erro ao obter token:', error);
            return '';
        }
    }

    async logPageAccess(pageKey) {
        try {
            const token = this.getToken();
            if (!token) return;

            const response = await fetch('/api/log-page-access', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    page_key: pageKey
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            console.log(`Acesso à página ${pageKey} registrado`);
        } catch (error) {
            console.error('Erro ao registrar acesso à página:', error);
        }
    }

    async logCustomAction(actionType, details = {}) {
        try {
            const token = this.getToken();
            if (!token) return;

            const logData = {
                action_type: actionType,
                page: this.currentPage,
                details: details,
                timestamp: new Date().toISOString()
            };

            const response = await fetch('/api/log-custom-action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(logData)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            console.log(`Ação ${actionType} registrada:`, details);
        } catch (error) {
            console.error('Erro ao registrar ação customizada:', error);
        }
    }

    setupActivityListeners() {
        // Monitorar cliques em botões importantes
        this.setupButtonClickTracking();
        
        // Monitorar submissões de formulários
        this.setupFormSubmitTracking();
        
        // Monitorar downloads
        this.setupDownloadTracking();
        
        // Monitorar tempo na página
        this.setupTimeTracking();
        
        // Monitorar erros JavaScript
        this.setupErrorTracking();
    }

    setupButtonClickTracking() {
        document.addEventListener('click', (event) => {
            const target = event.target;
            
            // Rastrear apenas elementos específicos
            if (target.matches('button, .btn, [role="button"], a.button, input[type="submit"]')) {
                const buttonText = target.textContent?.trim() || target.value || target.getAttribute('aria-label') || 'Botão sem texto';
                const buttonId = target.id || target.className || 'unknown';
                
                this.logCustomAction('button_click', {
                    button_text: buttonText.substring(0, 100), // Limitar tamanho
                    button_id: buttonId,
                    page: this.currentPage
                });
            }
        });
    }

    setupFormSubmitTracking() {
        document.addEventListener('submit', (event) => {
            const form = event.target;
            const formId = form.id || form.className || 'unknown_form';
            
            this.logCustomAction('form_submit', {
                form_id: formId,
                form_action: form.action || 'unknown',
                page: this.currentPage
            });
        });
    }

    setupDownloadTracking() {
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target.tagName === 'A' && target.href) {
                const href = target.href.toLowerCase();
                if (href.includes('.pdf') || href.includes('.csv') || href.includes('.xlsx') || 
                    href.includes('.doc') || href.includes('.zip')) {
                    
                    this.logCustomAction('file_download', {
                        file_url: target.href,
                        file_name: target.download || target.textContent || 'unknown',
                        page: this.currentPage
                    });
                }
            }
        });
    }

    setupTimeTracking() {
        let startTime = Date.now();
        let isActive = true;

        // Registrar tempo gasto na página
        window.addEventListener('beforeunload', () => {
            const timeSpent = Math.round((Date.now() - startTime) / 1000); // em segundos
            if (timeSpent > 5) { // Só registrar se passou mais de 5 segundos
                this.logCustomAction('time_on_page', {
                    time_seconds: timeSpent,
                    page: this.currentPage
                });
            }
        });

        // Detectar quando o usuário muda de aba ou minimiza a janela
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                isActive = false;
            } else {
                isActive = true;
                startTime = Date.now(); // Reset timer quando volta para a página
            }
        });
    }

    setupErrorTracking() {
        window.addEventListener('error', (event) => {
            this.logCustomAction('javascript_error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                page: this.currentPage
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.logCustomAction('promise_rejection', {
                reason: event.reason?.toString() || 'Unknown reason',
                page: this.currentPage
            });
        });
    }

    // Método para rastrear ações específicas manualmente
    trackAction(actionName, details = {}) {
        this.logCustomAction(actionName, details);
    }

    // Método para rastrear buscas específicas
    trackSearch(searchTerm, filters = {}) {
        this.logCustomAction('custom_search', {
            search_term: searchTerm,
            filters: filters,
            page: this.currentPage
        });
    }
}

// Inicializar o monitor automaticamente quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    // Criar instância global do monitor
    window.userActivityMonitor = new UserActivityMonitor();
    
    // Expor métodos globais para uso manual
    window.trackUserAction = (actionName, details) => {
        if (window.userActivityMonitor) {
            window.userActivityMonitor.trackAction(actionName, details);
        }
    };
    
    window.trackSearchAction = (searchTerm, filters) => {
        if (window.userActivityMonitor) {
            window.userActivityMonitor.trackSearch(searchTerm, filters);
        }
    };
});

// Export para módulos (se estiver usando ES6 modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserActivityMonitor;
}
