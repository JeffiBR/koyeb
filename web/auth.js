// auth.js - VERSÃO COMPLETA E CORRIGIDA (SEM TIMEOUT)

const SUPABASE_URL = 'https://zhaetrzpkkgzfrwxfqdw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYWV0cnpwa2tnemZyd3hmcWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjM3MzksImV4cCI6MjA3Mjk5OTczOX0.UHoWWZahvp_lMDH8pK539YIAFTAUnQk9mBX5tdixwN0';

// Cache e estado
const authCache = {
    profile: null,
    lastProfileFetch: 0,
    profileCacheDuration: 5 * 60 * 1000, // 5 minutos
    session: null,
    lastSessionCheck: 0,
    sessionCacheDuration: 30 * 1000, // 30 segundos
    permissionCache: new Map(),
    permissionCacheDuration: 2 * 60 * 1000 // 2 minutos
};

let authStateChangeSubscribers = [];
let isInitialized = false;

// Torna o supabase globalmente disponível
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Validação de token JWT básica
 */
function isValidToken(token) {
    if (!token || typeof token !== 'string') return false;
    
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        
        // Verifica se é um JWT válido (formato básico)
        const payload = JSON.parse(atob(parts[1]));
        const now = Math.floor(Date.now() / 1000);
        
        // Verifica expiração
        if (payload.exp && payload.exp < now) {
            console.warn('Token expirado');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Erro na validação do token:', error);
        return false;
    }
}

/**
 * Função centralizada para requisições autenticadas SEM TIMEOUT
 */
async function authenticatedFetch(url, options = {}) {
    try {
        const session = await getSession();
        if (!session) {
            const error = new Error("Sessão não encontrada.");
            error.code = 'NO_SESSION';
            throw error;
        }

        // VALIDAÇÃO RÁPIDA DO TOKEN
        const token = session.access_token;
        if (!isValidToken(token)) {
            console.error('Token JWT inválido');
            await handleAuthError();
            throw new Error("Token de autenticação inválido.");
        }

        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        const finalOptions = {
            ...options,
            headers: { ...defaultHeaders, ...options.headers }
        };

        const response = await fetch(url, finalOptions);

        // Tratamento otimizado de erros
        if (response.status === 401) {
            await handleAuthError();
            throw new Error("Sessão expirada. Por favor, faça login novamente.");
        }

        if (response.status === 403) {
            const errorText = await response.text();
            let errorDetail = 'Acesso negado.';
            
            try {
                const errorJson = JSON.parse(errorText);
                errorDetail = errorJson.detail || errorDetail;
            } catch (e) {
                errorDetail = errorText;
            }

            if (errorDetail.includes('acesso expirou') || errorDetail.includes('acesso à plataforma expirou')) {
                showAccessExpiredMessage();
                throw new Error('ACCESS_EXPIRED');
            }
            
            throw new Error(errorDetail);
        }

        return response;
    } catch (error) {
        throw error;
    }
}

/**
 * Busca o usuário autenticado com cache
 */
async function getAuthUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        return null;
    }
}

/**
 * Busca o perfil do usuário com cache inteligente
 */
async function fetchUserProfile(forceRefresh = false) {
    const now = Date.now();
    const cacheKey = 'userProfile';
    
    // Verifica cache válido
    if (!forceRefresh && 
        authCache.profile && 
        (now - authCache.lastProfileFetch) < authCache.profileCacheDuration) {
        return authCache.profile;
    }

    try {
        const session = await getSession();
        if (!session) {
            console.log('Nenhuma sessão encontrada em fetchUserProfile');
            return null;
        }

        const response = await authenticatedFetch('/api/users/me');
        if (!response.ok) {
            if (response.status === 401 || response.status === 404) {
                await signOut();
                return null;
            }
            throw new Error(`Falha ao buscar perfil: ${response.status}`);
        }

        authCache.profile = await response.json();
        authCache.lastProfileFetch = now;
        
        // Limpa cache de permissões quando o perfil é atualizado
        authCache.permissionCache.clear();
        
        notifyAuthStateChange();
        return authCache.profile;
    } catch (error) {
        console.error("Erro em fetchUserProfile:", error);

        if (error.code === 'NO_SESSION' || 
            error.message.includes('Sessão expirada') || 
            error.message.includes('Token de autenticação inválido')) {
            redirectToLogin();
        }
        return null;
    }
}

/**
 * Obtém a sessão atual com cache
 */
async function getSession() {
    const now = Date.now();
    
    // Retorna sessão em cache se ainda é válida
    if (authCache.session && 
        (now - authCache.lastSessionCheck) < authCache.sessionCacheDuration) {
        return authCache.session;
    }

    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
            console.error('Erro ao obter sessão:', error);
            await supabase.auth.signOut();
            return null;
        }

        // Validação da sessão
        if (session && session.access_token) {
            if (!isValidToken(session.access_token)) {
                console.error('Token JWT inválido na sessão');
                await supabase.auth.signOut();
                return null;
            }
        }

        authCache.session = session;
        authCache.lastSessionCheck = now;
        return session;
    } catch (error) {
        console.error('Erro ao obter sessão:', error);
        return null;
    }
}

/**
 * Sistema de permissões otimizado com cache
 */
class PermissionManager {
    constructor() {
        this.cache = new Map();
        this.cacheDuration = 2 * 60 * 1000; // 2 minutos
    }

    async checkPermission(permission, profile = null) {
        const cacheKey = `perm_${permission}`;
        const now = Date.now();
        const cached = this.cache.get(cacheKey);

        // Retorna do cache se válido
        if (cached && (now - cached.timestamp) < this.cacheDuration) {
            return cached.result;
        }

        const userProfile = profile || await fetchUserProfile();
        if (!userProfile) return false;

        let hasPermission = false;

        // Admin tem todas as permissões
        if (userProfile.role === 'admin') {
            hasPermission = true;
        } 
        // Verificação para subadministradores
        else if ((permission === 'group_admin_users' || permission === 'group_admin') && 
                 userProfile.managed_groups && userProfile.managed_groups.length > 0) {
            hasPermission = true;
        }
        // Verificação de páginas permitidas
        else if (userProfile.allowed_pages && userProfile.allowed_pages.includes(permission)) {
            hasPermission = true;
        }

        // Armazena no cache
        this.cache.set(cacheKey, {
            result: hasPermission,
            timestamp: now
        });

        return hasPermission;
    }

    clearCache() {
        this.cache.clear();
    }

    async checkMultiplePermissions(permissions) {
        const results = {};
        const profile = await fetchUserProfile();
        
        await Promise.all(
            permissions.map(async perm => {
                results[perm] = await this.checkPermission(perm, profile);
            })
        );
        
        return results;
    }
}

const permissionManager = new PermissionManager();

/**
 * Protege rotas com sistema de permissões otimizado
 */
async function routeGuard(requiredPermission = null) {
    // Verificação rápida de autenticação
    const user = await getAuthUser();
    if (!user) {
        redirectToLogin();
        return false;
    }

    // Verificação rápida de acesso expirado
    const isExpired = await checkAccessExpiration();
    if (isExpired) {
        return false;
    }

    // Verificação de permissão se necessário
    if (requiredPermission) {
        const hasAccess = await permissionManager.checkPermission(requiredPermission);
        if (!hasAccess) {
            alert('Você não tem permissão para acessar esta página.');
            window.location.href = '/search.html';
            return false;
        }
    }

    return true;
}

/**
 * Verificação de permissão otimizada
 */
async function hasPermission(permission) {
    return permissionManager.checkPermission(permission);
}

/**
 * Verifica se o usuário pode gerenciar um grupo específico (otimizado)
 */
async function canManageGroup(groupId) {
    const cacheKey = `group_${groupId}`;
    const now = Date.now();
    const cached = authCache.permissionCache.get(cacheKey);

    if (cached && (now - cached.timestamp) < authCache.permissionCacheDuration) {
        return cached.result;
    }

    const profile = await fetchUserProfile();
    if (!profile) return false;

    let canManage = false;

    if (profile.role === 'admin') {
        canManage = true;
    } else if (profile.managed_groups) {
        canManage = profile.managed_groups.includes(parseInt(groupId));
    }

    authCache.permissionCache.set(cacheKey, {
        result: canManage,
        timestamp: now
    });

    return canManage;
}

/**
 * Verifica acesso expirado de forma otimizada
 */
async function checkAccessExpiration() {
    try {
        const profile = await fetchUserProfile();
        if (!profile) return true;

        // Admins e subadministradores não têm expiração
        if (profile.role === 'admin' || 
            (profile.managed_groups && profile.managed_groups.length > 0)) {
            return false;
        }

        // Cache para verificação de grupos (evita chamadas repetidas)
        const cacheKey = 'access_expiration';
        const now = Date.now();
        const cached = authCache.permissionCache.get(cacheKey);

        if (cached && (now - cached.timestamp) < authCache.permissionCacheDuration) {
            return cached.result;
        }

        const response = await authenticatedFetch('/api/my-groups-detailed');
        const userGroups = await response.json();

        const today = new Date().toISOString().split('T')[0];
        const hasActiveAccess = userGroups.some(group => 
            group.data_expiracao && group.data_expiracao >= today
        );

        authCache.permissionCache.set(cacheKey, {
            result: !hasActiveAccess,
            timestamp: now
        });

        if (!hasActiveAccess) {
            showAccessExpiredMessage();
            return true;
        }

        return false;
    } catch (error) {
        console.error('Erro ao verificar expiração de acesso:', error);
        return false;
    }
}

/**
 * Sistema de logout otimizado
 */
async function signOut() {
    try {
        // Limpa todos os caches
        clearAllCaches();
        
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        notifyAuthStateChange();
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
        // Força o redirect mesmo em caso de erro
        window.location.href = '/login.html';
    }
}

/**
 * Limpeza de caches
 */
function clearAllCaches() {
    authCache.profile = null;
    authCache.session = null;
    authCache.lastProfileFetch = 0;
    authCache.lastSessionCheck = 0;
    authCache.permissionCache.clear();
    permissionManager.clearCache();
    localStorage.removeItem('currentUser');
}

/**
 * CORREÇÃO: Função com nome correto - estava como clearUserProfileCac
 */
function clearUserProfileCache() {
    authCache.profile = null;
    authCache.lastProfileFetch = 0;
    permissionManager.clearCache();
}

/**
 * Inicialização otimizada da autenticação
 */
async function initAuth() {
    if (isInitialized) {
        console.warn('Auth já inicializado');
        return;
    }

    try {
        isInitialized = true;
        
        // Verificação inicial rápida
        await checkAndUpdateAuthState();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Evento de autenticação:', event);

            // Limpa caches em eventos relevantes
            if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'USER_DELETED'].includes(event)) {
                clearAllCaches();
            }

            switch (event) {
                case 'SIGNED_IN':
                    console.log('Usuário fez login');
                    await fetchUserProfile(true);
                    break;

                case 'SIGNED_OUT':
                    console.log('Usuário fez logout');
                    notifyAuthStateChange();
                    break;

                case 'TOKEN_REFRESHED':
                    console.log('Token atualizado');
                    // Atualiza sessão em cache
                    authCache.session = session;
                    authCache.lastSessionCheck = Date.now();
                    break;

                case 'USER_UPDATED':
                    console.log('Usuário atualizado');
                    await fetchUserProfile(true);
                    break;
            }
        });

        return subscription;
    } catch (error) {
        console.error('Erro na inicialização da autenticação:', error);
        isInitialized = false;
        return null;
    }
}

/**
 * Middleware de autenticação para rotas
 */
function createAuthMiddleware() {
    return {
        async requireAuth(redirectUrl = '/login.html') {
            const isAuthenticated = await checkAuth();
            if (!isAuthenticated) {
                window.location.href = redirectUrl;
                return false;
            }
            return true;
        },

        async requirePermission(permission, redirectUrl = '/search.html') {
            const hasPerm = await hasPermission(permission);
            if (!hasPerm) {
                alert('Você não tem permissão para acessar esta página.');
                window.location.href = redirectUrl;
                return false;
            }
            return true;
        },

        async requireGroupAccess(groupId) {
            const canManage = await canManageGroup(groupId);
            if (!canManage) {
                alert('Você não tem permissão para gerenciar este grupo.');
                window.location.href = '/search.html';
                return false;
            }
            return true;
        }
    };
}

/**
 * Verificação de autenticação otimizada
 */
async function checkAuth() {
    try {
        const session = await getSession();
        return !!(session && isValidToken(session.access_token));
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        return false;
    }
}

/**
 * Funções auxiliares otimizadas
 */
async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password
        });

        if (error) throw error;

        clearAllCaches();
        await fetchUserProfile(true);
        return data;
    } catch (error) {
        console.error('Erro no login:', error);
        throw error;
    }
}

/**
 * Função para lidar com erros de autenticação
 */
async function handleAuthError() {
    clearAllCaches();
    await supabase.auth.signOut();
    redirectToLogin();
}

/**
 * Redireciona para a página de login
 */
function redirectToLogin() {
    window.location.href = '/login.html';
}

/**
 * Mostra mensagem de acesso expirado
 */
function showAccessExpiredMessage() {
    alert('Seu acesso à plataforma expirou. Entre em contato com o suporte para renovação.');
}

/**
 * Notifica os subscribers sobre mudanças no estado de autenticação
 */
function notifyAuthStateChange() {
    authStateChangeSubscribers.forEach(callback => {
        try {
            callback();
        } catch (error) {
            console.error('Erro ao notificar mudança de estado de autenticação:', error);
        }
    });
}

/**
 * Verifica e atualiza o estado de autenticação
 */
async function checkAndUpdateAuthState() {
    const session = await getSession();
    if (session) {
        await fetchUserProfile();
    }
}

/**
 * Sistema de subscribe para mudanças de estado de autenticação
 */
function subscribeToAuthStateChange(callback) {
    if (typeof callback === 'function') {
        authStateChangeSubscribers.push(callback);
        
        // Retorna função para unsubscribe
        return () => {
            const index = authStateChangeSubscribers.indexOf(callback);
            if (index > -1) {
                authStateChangeSubscribers.splice(index, 1);
            }
        };
    }
}

/**
 * Obtém o perfil do usuário atual (com cache)
 */
async function getCurrentUserProfile() {
    return await fetchUserProfile();
}

/**
 * Verifica se o usuário atual é administrador
 */
async function isAdmin() {
    const profile = await fetchUserProfile();
    return profile && profile.role === 'admin';
}

/**
 * Verifica se o usuário atual é subadministrador
 */
async function isGroupAdmin() {
    const profile = await fetchUserProfile();
    return profile && profile.managed_groups && profile.managed_groups.length > 0;
}

/**
 * Verifica se o usuário atual tem acesso a uma página específica
 */
async function hasPageAccess(pageKey) {
    const profile = await fetchUserProfile();
    if (!profile) return false;
    
    if (profile.role === 'admin') return true;
    if (profile.managed_groups && profile.managed_groups.length > 0) {
        // Subadmins têm acesso às páginas de grupo por padrão
        if (pageKey === 'group_admin_users' || pageKey === 'group_admin') return true;
    }
    
    return profile.allowed_pages && profile.allowed_pages.includes(pageKey);
}

/**
 * Configuração de error handling global
 */
function setupGlobalErrorHandling() {
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

    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason && event.reason.message === 'ACCESS_EXPIRED') {
            event.preventDefault();
        }
    });
}

// Inicialização otimizada
document.addEventListener('DOMContentLoaded', function() {
    if (!isInitialized) {
        initAuth().catch(error => {
            console.error('Falha na inicialização da autenticação:', error);
        });
        setupGlobalErrorHandling();
    }
});

// Exportações
const authMiddleware = createAuthMiddleware();

// Torna as funções disponíveis globalmente
window.authenticatedFetch = authenticatedFetch;
window.getAuthUser = getAuthUser;
window.fetchUserProfile = fetchUserProfile;
window.getSession = getSession;
window.signOut = signOut;
window.routeGuard = routeGuard;
window.checkAuth = checkAuth;
window.clearUserProfileCache = clearUserProfileCache; // CORREÇÃO: Nome correto
window.requireAuth = authMiddleware.requireAuth;
window.getAuthToken = async () => (await getSession())?.access_token;
window.hasPermission = hasPermission;
window.initAuth = initAuth;
window.signIn = signIn;
window.checkAccessExpiration = checkAccessExpiration;
window.showAccessExpiredMessage = showAccessExpiredMessage;
window.canManageGroup = canManageGroup;
window.authMiddleware = authMiddleware;

// NOVAS FUNÇÕES EXPORTADAS
window.subscribeToAuthStateChange = subscribeToAuthStateChange;
window.getCurrentUserProfile = getCurrentUserProfile;
window.isAdmin = isAdmin;
window.isGroupAdmin = isGroupAdmin;
window.hasPageAccess = hasPageAccess;
window.handleAuthError = handleAuthError;
window.redirectToLogin = redirectToLogin;
window.clearAllCaches = clearAllCaches;

console.log('✅ auth.js carregado - Versão Completa e Corrigida (SEM TIMEOUT)');
