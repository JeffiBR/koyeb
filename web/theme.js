// theme.js - Gerenciador de temas universal

// Configurações do tema
const themeConfig = {
    light: {
        name: 'light',
        icon: 'fa-sun',
        label: 'Modo Claro',
        bodyClass: 'light-mode'
    },
    dark: {
        name: 'dark',
        icon: 'fa-moon',
        label: 'Modo Escuro',
        bodyClass: 'theme-dark'
    }
};

// Inicializar tema
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    setupThemeToggle();
}

// Aplicar tema
function setTheme(themeName) {
    const theme = themeConfig[themeName] || themeConfig.dark;
    
    // Remover classes de tema existentes
    document.body.classList.remove('light-mode', 'theme-dark');
    // Adicionar classe do tema atual
    document.body.classList.add(theme.bodyClass);
    
    // Atualizar localStorage
    localStorage.setItem('theme', theme.name);
    
    // Atualizar botão de toggle se existir
    updateThemeToggleButton(theme);
    
    // Disparar evento personalizado para notificar outras partes do código
    document.dispatchEvent(new CustomEvent('themeChanged', { 
        detail: { theme: theme.name }
    }));
    
    console.log(`Tema alterado para: ${theme.label}`);
}

// Atualizar botão de toggle
function updateThemeToggleButton(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = `fas ${theme.icon}`;
        }
        themeToggle.title = theme.label;
        themeToggle.setAttribute('aria-label', theme.label);
    }
}

// Configurar evento de toggle
function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}

// Alternar entre temas
function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

// Obter tema atual
function getCurrentTheme() {
    return localStorage.getItem('theme') || 'dark';
}

// Verificar se é tema escuro
function isDarkTheme() {
    return getCurrentTheme() === 'dark';
}

// Sincronizar tema entre abas
function setupThemeSync() {
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme') {
            setTheme(e.newValue || 'dark');
        }
    });
}

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTheme);
} else {
    initializeTheme();
}

// Configurar sincronização entre abas
setupThemeSync();

// Exportar funções para uso global
window.themeManager = {
    initializeTheme,
    setTheme,
    toggleTheme,
    getCurrentTheme,
    isDarkTheme
};
