// product-log-ui.js - Gerenciamento da interface do usuário
class ProductLogUI {
    constructor() {
        this.searchTimeout = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTheme();
        this.setupViewToggle();
        this.setupFilters();
        this.setupExportButton();
    }

    setupEventListeners() {
        // Alternador de tema
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Ordenação das colunas
        this.setupSorting();
    }

    setupTheme() {
        // Verificar tema salvo
        if (localStorage.getItem('theme') === 'light') {
            document.body.classList.add('light-mode');
            const themeIcon = document.querySelector('#themeToggle i');
            if (themeIcon) {
                themeIcon.className = 'fas fa-sun';
            }
        }
    }

    toggleTheme() {
        document.body.classList.toggle('light-mode');
        const icon = document.querySelector('#themeToggle i');
        if (icon) {
            if (document.body.classList.contains('light-mode')) {
                icon.className = 'fas fa-sun';
                localStorage.setItem('theme', 'light');
            } else {
                icon.className = 'fas fa-moon';
                localStorage.setItem('theme', 'dark');
            }
        }
    }

    setupViewToggle() {
        const tableViewBtn = document.getElementById('tableViewBtn');
        const cardViewBtn = document.getElementById('cardViewBtn');
        const tableView = document.querySelector('.table-view');
        const cardView = document.querySelector('.card-view');

        if (tableViewBtn && cardViewBtn && tableView && cardView) {
            tableViewBtn.addEventListener('click', () => {
                tableView.style.display = 'block';
                cardView.style.display = 'none';
                tableViewBtn.classList.add('active');
                cardViewBtn.classList.remove('active');
                this.saveViewPreference('table');
            });

            cardViewBtn.addEventListener('click', () => {
                tableView.style.display = 'none';
                cardView.style.display = 'block';
                tableViewBtn.classList.remove('active');
                cardViewBtn.classList.add('active');
                this.saveViewPreference('card');
            });

            // Restaurar preferência salva
            this.restoreViewPreference();
        }
    }

    saveViewPreference(view) {
        localStorage.setItem('productLogView', view);
    }

    restoreViewPreference() {
        const savedView = localStorage.getItem('productLogView') || 'table';
        const tableViewBtn = document.getElementById('tableViewBtn');
        const cardViewBtn = document.getElementById('cardViewBtn');
        const tableView = document.querySelector('.table-view');
        const cardView = document.querySelector('.card-view');

        if (savedView === 'card' && tableView && cardView) {
            tableView.style.display = 'none';
            cardView.style.display = 'block';
            if (tableViewBtn) tableViewBtn.classList.remove('active');
            if (cardViewBtn) cardViewBtn.classList.add('active');
        } else if (tableView && cardView) {
            tableView.style.display = 'block';
            cardView.style.display = 'none';
            if (tableViewBtn) tableViewBtn.classList.add('active');
            if (cardViewBtn) cardViewBtn.classList.remove('active');
        }
    }

    setupSorting() {
        const sortableHeaders = document.querySelectorAll('.sortable-header');
        sortableHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const column = header.dataset.sort;
                const indicator = header.querySelector('.sort-indicator');
                
                // Resetar todos os indicadores
                document.querySelectorAll('.sort-indicator').forEach(ind => {
                    ind.className = 'fas fa-sort sort-indicator';
                });
                
                // Alternar entre ascendente e descendente
                let direction = 'asc';
                if (indicator.classList.contains('fa-sort-up')) {
                    indicator.className = 'fas fa-sort-down sort-indicator';
                    direction = 'desc';
                } else if (indicator.classList.contains('fa-sort-down')) {
                    indicator.className = 'fas fa-sort sort-indicator';
                    direction = 'none';
                } else {
                    indicator.className = 'fas fa-sort-up sort-indicator';
                    direction = 'asc';
                }
                
                // Chamar função de ordenação se existir no product-log.js
                if (window.currentSort && direction !== 'none') {
                    window.currentSort = { column: column, direction: direction };
                    if (window.fetchLogs) {
                        window.fetchLogs(window.currentPage || 1);
                    }
                }
            });
        });
    }

    setupFilters() {
        // Limpar filtros
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => this.clearFilters());
        }

        // Aplicar filtros
        const applyFiltersBtn = document.getElementById('applyFiltersBtn');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => this.applyFilters());
        }

        // Busca em tempo real com debounce
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.updateActiveFilters();
                    this.applyFilters();
                }, 500);
            });
        }

        // Filtros com aplicação automática
        const autoApplyFilters = ['supermarketFilter', 'dateFilter', 'priceRange'];
        autoApplyFilters.forEach(filterId => {
            const filter = document.getElementById(filterId);
            if (filter) {
                filter.addEventListener('change', () => {
                    this.updateActiveFilters();
                    this.applyFilters();
                });
            }
        });

        // Inicializar filtros ativos
        this.updateActiveFilters();
    }

    setupExportButton() {
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportData());
        }
    }

    clearFilters() {
        // Limpar inputs
        const searchInput = document.getElementById('searchInput');
        const supermarketFilter = document.getElementById('supermarketFilter');
        const dateFilter = document.getElementById('dateFilter');
        const priceRange = document.getElementById('priceRange');

        if (searchInput) searchInput.value = '';
        if (supermarketFilter) supermarketFilter.value = '';
        if (dateFilter) dateFilter.value = '';
        if (priceRange) priceRange.value = '';
        
        // Limpar filtros ativos
        this.clearActiveFilters();
        
        // Recarregar dados
        this.applyFilters();
    }

    applyFilters() {
        // Resetar para primeira página
        if (window.currentPage) {
            window.currentPage = 1;
        }
        
        // Recarregar dados usando a função existente do product-log.js
        if (window.fetchLogs) {
            window.fetchLogs(window.currentPage || 1);
        }
    }

    updateActiveFilters() {
        const activeFilters = document.getElementById('activeFilters');
        if (!activeFilters) return;
        
        activeFilters.innerHTML = '';
        
        const searchValue = document.getElementById('searchInput')?.value.trim();
        const supermarketValue = document.getElementById('supermarketFilter')?.value;
        const dateValue = document.getElementById('dateFilter')?.value;
        const priceValue = document.getElementById('priceRange')?.value;
        
        if (searchValue) {
            this.addActiveFilter('Busca', searchValue, 'searchInput');
        }
        
        if (supermarketValue) {
            const supermarketText = document.getElementById('supermarketFilter')?.options[document.getElementById('supermarketFilter').selectedIndex]?.text || supermarketValue;
            this.addActiveFilter('Supermercado', supermarketText, 'supermarketFilter');
        }
        
        if (dateValue) {
            this.addActiveFilter('Data', new Date(dateValue).toLocaleDateString('pt-BR'), 'dateFilter');
        }
        
        if (priceValue) {
            const priceText = document.getElementById('priceRange')?.options[document.getElementById('priceRange').selectedIndex]?.text || priceValue;
            this.addActiveFilter('Faixa de Preço', priceText, 'priceRange');
        }
    }

    addActiveFilter(label, value, filterId) {
        const activeFilters = document.getElementById('activeFilters');
        if (!activeFilters) return;

        const filterElement = document.createElement('div');
        filterElement.className = 'active-filter';
        filterElement.innerHTML = `
            <span>${label}: ${value}</span>
            <button class="remove-filter" data-filter="${filterId}">
                <i class="fas fa-times"></i>
            </button>
        `;
        activeFilters.appendChild(filterElement);
        
        // Adicionar evento para remover filtro individual
        const removeBtn = filterElement.querySelector('.remove-filter');
        removeBtn.addEventListener('click', () => {
            const filterToRemove = removeBtn.getAttribute('data-filter');
            const filterElement = document.getElementById(filterToRemove);
            if (filterElement) {
                filterElement.value = '';
            }
            filterElement.parentElement.remove();
            
            // Recarregar dados
            this.applyFilters();
            
            // Atualizar filtros ativos
            this.updateActiveFilters();
        });
    }

    clearActiveFilters() {
        const activeFilters = document.getElementById('activeFilters');
        if (activeFilters) {
            activeFilters.innerHTML = '';
        }
    }

    async exportData() {
        try {
            const session = await getSession();
            if (!session) return;

            // Construir parâmetros de filtro atuais
            const params = new URLSearchParams();
            
            // Adicionar parâmetros atuais (simulando o que o product-log.js faz)
            const searchValue = document.getElementById('searchInput')?.value.trim();
            const supermarketValue = document.getElementById('supermarketFilter')?.value;
            const dateValue = document.getElementById('dateFilter')?.value;
            const priceValue = document.getElementById('priceRange')?.value;

            if (searchValue) params.append('search', searchValue);
            if (supermarketValue) params.append('supermarket', supermarketValue);
            if (dateValue) params.append('date', dateValue);
            if (priceValue) params.append('price_range', priceValue);

            // Usar a mesma URL da API
            const response = await fetch(`/api/products-log/export?${params}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `produtos_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showNotification('Exportação realizada com sucesso!', 'success');
            } else {
                throw new Error('Falha ao exportar dados');
            }
        } catch (error) {
            console.error('Erro ao exportar dados:', error);
            this.showNotification('Erro ao exportar dados', 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Criar elemento de notificação
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}"></i>
            <span>${message}</span>
        `;
        
        // Adicionar estilos se não existirem
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 1rem 1.5rem;
                    border-radius: 12px;
                    color: white;
                    font-weight: 600;
                    z-index: 10000;
                    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
                    transform: translateX(100%);
                    opacity: 0;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    max-width: 400px;
                }
                .notification.show {
                    transform: translateX(0);
                    opacity: 1;
                }
                .notification.success {
                    background: linear-gradient(135deg, #10b981, #34d399);
                }
                .notification.error {
                    background: linear-gradient(135deg, #ef4444, #f87171);
                }
                .notification.info {
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(notification);
        
        // Mostrar notificação
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remover após 3 segundos
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Método para integrar com o product-log.js existente
    integrateWithExistingCode() {
        // Sobrescrever a função fetchLogs para incluir nossos filtros
        const originalFetchLogs = window.fetchLogs;
        
        if (originalFetchLogs) {
            window.fetchLogs = async (page) => {
                // Chamar a função original mas com nossos filtros
                if (typeof originalFetchLogs === 'function') {
                    await originalFetchLogs(page);
                }
            };
        }
    }
}

// Inicialização quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    // Aguardar um pouco para garantir que o product-log.js tenha carregado
    setTimeout(() => {
        window.productLogUI = new ProductLogUI();
        
        // Tentar integrar com o código existente
        window.productLogUI.integrateWithExistingCode();
    }, 100);
});

// Função auxiliar para obter parâmetros de filtro atuais
function getCurrentFilterParams() {
    const params = new URLSearchParams();
    
    const searchValue = document.getElementById('searchInput')?.value.trim();
    const supermarketValue = document.getElementById('supermarketFilter')?.value;
    const dateValue = document.getElementById('dateFilter')?.value;
    const priceValue = document.getElementById('priceRange')?.value;

    if (searchValue) params.append('search', searchValue);
    if (supermarketValue) params.append('supermarket', supermarketValue);
    if (dateValue) params.append('date', dateValue);
    if (priceValue) params.append('price_range', priceValue);
    
    return params;
}
