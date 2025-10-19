// session-manager.js
class SessionManager {
    constructor() {
        this.checkInterval = null;
        this.warningShown = false;
        this.lastActivity = Date.now();
        this.inactivityTimeout = 25 * 60 * 1000; // 25 minutos
        this.warningTimeout = 20 * 60 * 1000; // 20 minutos
        
        this.setupActivityListeners();
        this.startSessionChecker();
    }
    
    setupActivityListeners() {
        // Monitora atividade do usuário
        ['click', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, () => {
                this.lastActivity = Date.now();
                this.warningShown = false;
            });
        });
    }
    
    startSessionChecker() {
        // Verifica a sessão a cada minuto
        this.checkInterval = setInterval(() => {
            this.checkSession();
        }, 60000);
    }
    
    async checkSession() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) throw error;
            
            if (!session) {
                this.redirectToLogin();
                return;
            }
            
            // Verifica inatividade
            const inactiveTime = Date.now() - this.lastActivity;
            
            if (inactiveTime > this.inactivityTimeout) {
                await supabase.auth.signOut();
                this.redirectToLogin();
                return;
            }
            
            // Mostra aviso de inatividade
            if (inactiveTime > this.warningTimeout && !this.warningShown) {
                this.showInactivityWarning();
            }
            
            // Renova o token se estiver perto de expirar
            const expiresAt = new Date(session.expires_at).getTime();
            const currentTime = Date.now();
            const timeUntilExpiry = expiresAt - currentTime;
            
            if (timeUntilExpiry < 300000) { // 5 minutos
                await this.refreshSession();
            }
        } catch (error) {
            console.error('Erro ao verificar sessão:', error);
            this.redirectToLogin();
        }
    }
    
    async refreshSession() {
        try {
            const { data, error } = await supabase.auth.refreshSession();
            if (error) throw error;
            console.log('Sessão renovada com sucesso');
        } catch (error) {
            console.error('Erro ao renovar sessão:', error);
            this.redirectToLogin();
        }
    }
    
    showInactivityWarning() {
        this.warningShown = true;
        
        // Cria um modal de aviso
        const warningModal = document.createElement('div');
        warningModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            text-align: center;
            min-width: 300px;
        `;
        
        warningModal.innerHTML = `
            <h3 style="margin-top: 0;">Sessão Prestes a Expirar</h3>
            <p>Você será desconectado por inatividade em 5 minutos.</p>
            <button id="continueSession" style="
                background: #4f46e5;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 10px;
            ">Manter Sessão Ativa</button>
        `;
        
        document.body.appendChild(warningModal);
        
        // Adiciona evento ao botão
        document.getElementById('continueSession').addEventListener('click', () => {
            this.lastActivity = Date.now();
            this.warningShown = false;
            document.body.removeChild(warningModal);
        });
    }
    
    redirectToLogin() {
        // Redireciona para login com a URL atual como parâmetro de retorno
        const currentUrl = encodeURIComponent(window.location.href);
        window.location.href = `/login.html?redirect=${currentUrl}`;
    }
    
    // Método para ser chamado durante operações longas
    async ensureActiveSession() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error || !session) {
                throw new Error('Sessão expirada');
            }
            
            // Renova a sessão se estiver próxima da expiração
            const expiresAt = new Date(session.expires_at).getTime();
            const currentTime = Date.now();
            const timeUntilExpiry = expiresAt - currentTime;
            
            if (timeUntilExpiry < 600000) { // 10 minutos
                await this.refreshSession();
            }
            
            return true;
        } catch (error) {
            this.redirectToLogin();
            return false;
        }
    }
}

// Inicializa o gerenciador de sessão
let sessionManager;

document.addEventListener('DOMContentLoaded', () => {
    sessionManager = new SessionManager();
});
