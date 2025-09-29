// mobile-menu.js - Gerenciamento do menu lateral responsivo
document.addEventListener('DOMContentLoaded', () => {
    // Elementos do DOM
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    
    // Verificar se os elementos existem (para compatibilidade entre páginas)
    if (!mobileMenuBtn || !sidebar || !sidebarOverlay) {
        console.warn('Elementos do menu mobile não encontrados');
        return;
    }

    // Toggle do menu mobile
    mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('show');
        
        // Fechar dropdown do usuário se estiver aberto
        if (userDropdown && userDropdown.classList.contains('show')) {
            userDropdown.classList.remove('show');
        }
    });

    // Fechar menu ao clicar no overlay
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('show');
    });

    // Fechar menu ao clicar em um link (para mobile)
    const sidebarLinks = sidebar.querySelectorAll('a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('show');
            }
        });
    });

    // Gerenciamento do dropdown do usuário (se existir)
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });

        // Fechar dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('show');
            }
        });
    }

    // Fechar menus ao redimensionar a janela para desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('show');
            if (userDropdown) {
                userDropdown.classList.remove('show');
            }
        }
    });

    // Adicionar estilos dinâmicos para o menu mobile
    const style = document.createElement('style');
    style.textContent = `
        @media (max-width: 768px) {
            .sidebar {
                transform: translateX(-100%);
                transition: transform 0.3s ease;
                z-index: 1000;
            }
            
            .sidebar.open {
                transform: translateX(0);
            }
            
            .sidebar-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 999;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            
            .sidebar-overlay.show {
                opacity: 1;
                visibility: visible;
            }
            
            .mobile-menu-btn {
                display: flex !important;
                flex-direction: column;
                justify-content: space-between;
                width: 24px;
                height: 18px;
                background: none;
                border: none;
                cursor: pointer;
                padding: 0;
            }
            
            .mobile-menu-btn span {
                display: block;
                height: 2px;
                width: 100%;
                background-color: var(--text-color);
                transition: all 0.3s ease;
            }
            
            .mobile-menu-btn:hover span {
                background-color: var(--primary-color);
            }
        }
        
        @media (min-width: 769px) {
            .mobile-menu-btn {
                display: none !important;
            }
            
            .sidebar-overlay {
                display: none !important;
            }
        }
    `;
    document.head.appendChild(style);
});
