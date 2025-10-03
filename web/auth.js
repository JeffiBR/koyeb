// auth.js - VERSÃO FINAL

const SUPABASE_URL = 'https://zhaetrzpkkgzfrwxfqdw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYWV0cnpwa2tnemZyd3hmcWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjM3MzksImV4cCI6MjA3Mjk5OTczOX0.UHoWWZahvp_lMDH8pK539YIAFTAUnQk9mBX5tdixwN0';

const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY );
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

// ==================================================================
// --- FUNÇÃO ADICIONADA PARA LIMPEZA DE CACHE ---
/**
 * Limpa a variável de cache do perfil do usuário (currentUserProfile).
 * Isso força a próxima chamada a fetchUserProfile a buscar dados frescos do servidor.
 */
function clearUserProfileCache() {
    console.log('🧹 Cache de perfil em memória (auth.js) limpo.');
    currentUserProfile = null;
}
// ==================================================================

// A função updateUIVisibility foi removida pois sua lógica agora está centralizada no user-menu.js
