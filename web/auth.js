// auth.js - VERSÃO FINAL

const SUPABASE_URL = 'https://zhaetrzpkkgzfrwxfqdw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYWV0cnpwa2tnemZyd3hmcWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjM3MzksImV4cCI6MjA3Mjk5OTczOX0.UHoWWZahvp_lMDH8pK539YIAFTAUnQk9mBX5tdixwN0';

const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUserProfile = null; // Variável de cache em memória

/**
 * Função centralizada para requisições autenticadas.
 */
async function authenticatedFetch(url, options = {}) {
    const session = await getSession();

    if (!session) {
        alert("Sua sessão expirou ou é inválida. Por favor, faça login novamente.");
        window.location.href = '/login.html';
        throw new Error("Sessão não encontrada.");
    }

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
    };

    const finalOptions = { ...options, headers: { ...defaultHeaders, ...options.headers } };
    return fetch(url, finalOptions);
}

/**
 * Busca o usuário autenticado no Supabase.
 */
async function getAuthUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/**
 * Busca o perfil do usuário. Usa um cache em memória para evitar requisições repetidas.
 */
async function fetchUserProfile() {
    // Se já temos o perfil em cache, retorna ele imediatamente.
    if (currentUserProfile) {
        console.log('👤 Usando perfil do cache em memória (auth.js)');
        return currentUserProfile;
    }
    
    const session = await getSession();
    if (!session) return null;

    try {
        console.log('🌐 Buscando perfil do servidor (/api/users/me)');
        const response = await authenticatedFetch('/api/users/me');
        if (!response.ok) {
            if (response.status === 401 || response.status === 404) {
                await signOut();
                return null;
            }
            throw new Error('Falha ao buscar perfil do usuário.');
        }
        // Salva o perfil no cache em memória para futuras chamadas
        currentUserProfile = await response.json();
        return currentUserProfile;
    } catch (error) {
        console.error("Erro em fetchUserProfile:", error);
        return null;
    }
}

/**
 * Obtém a sessão atual do Supabase.
 */
async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

/**
 * Realiza o logout do usuário.
 */
async function signOut() {
    await supabase.auth.signOut();
    clearUserProfileCache(); // Limpa o cache ao sair
    localStorage.removeItem('currentUser');
    window.location.href = '/login.html';
}

/**
 * Protege rotas que exigem login e permissões específicas.
 */
async function routeGuard(requiredPermission = null) {
    const user = await getAuthUser();
    if (!user) {
        window.location.href = `/login.html?redirect=${window.location.pathname}`;
        return;
    }
    if (requiredPermission) {
        const profile = await fetchUserProfile();
        if (!profile || (profile.role !== 'admin' && (!profile.allowed_pages || !profile.allowed_pages.includes(requiredPermission)))) {
            alert('Você não tem permissão para acessar esta página.');
            window.location.href = '/search.html';
        }
    }
}

/**
 * Função para verificar autenticação - necessária para a página da cesta básica
 */
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        return false;
    }

    try {
        const response = await fetch('/api/users/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        return false;
    }
}

/**
 * Limpa a variável de cache do perfil do usuário (currentUserProfile).
 * Isso força a próxima chamada a fetchUserProfile a buscar dados frescos do servidor.
 */
function clearUserProfileCache() {
    console.log('🧹 Cache de perfil em memória (auth.js) limpo.');
    currentUserProfile = null;
}

/**
 * Verifica se o usuário está autenticado e redireciona se necessário
 */
async function requireAuth(redirectUrl = '/login.html') {
    const user = await getAuthUser();
    if (!user) {
        window.location.href = redirectUrl;
        return false;
    }
    return true;
}

/**
 * Obtém o token de autenticação atual
 */
async function getAuthToken() {
    const session = await getSession();
    return session?.access_token || null;
}

/**
 * Verifica se o usuário tem uma permissão específica
 */
async function hasPermission(permission) {
    const profile = await fetchUserProfile();
    if (!profile) return false;
    
    if (profile.role === 'admin') return true;
    
    return profile.allowed_pages && profile.allowed_pages.includes(permission);
}

/**
 * Inicializa a autenticação e verifica o estado do usuário
 */
async function initAuth() {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN') {
            console.log('Usuário fez login');
            clearUserProfileCache(); // Limpa cache para buscar dados atualizados
        } else if (event === 'SIGNED_OUT') {
            console.log('Usuário fez logout');
            clearUserProfileCache();
            currentUserProfile = null;
        } else if (event === 'TOKEN_REFRESHED') {
            console.log('Token atualizado');
        }
    });

    return subscription;
}

/**
 * Função auxiliar para fazer login com email e senha
 */
async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        throw error;
    }

    // Salva o token no localStorage para compatibilidade
    if (data.session) {
        localStorage.setItem('token', data.session.access_token);
    }

    clearUserProfileCache(); // Limpa cache para buscar dados atualizados
    return data;
}

/**
 * Função auxiliar para cadastrar novo usuário
 */
async function signUp(email, password, userMetadata = {}) {
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: userMetadata
        }
    });

    if (error) {
        throw error;
    }

    return data;
}

// Inicializa a autenticação quando o script é carregado
document.addEventListener('DOMContentLoaded', function() {
    initAuth().catch(console.error);
});

// Exporta funções para uso global (se necessário)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        authenticatedFetch,
        getAuthUser,
        fetchUserProfile,
        getSession,
        signOut,
        routeGuard,
        checkAuth,
        clearUserProfileCache,
        requireAuth,
        getAuthToken,
        hasPermission,
        initAuth,
        signIn,
        signUp
    };
}
