// ====== FUNÇÕES DE UI PARA PRODUCT-LOG ======

class ProductLogUI {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTheme();
        this.setupViewToggle();
        this.setupFilters();
    }

    setupEventListeners() {
        // Alternador de tema
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Ordenação das colunas
        this.setupSorting();

        // Filtros
        this.setupFilterEvents();
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

        if (tableViewBtn && cardViewBtn) {
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

        if (savedView === 'card') {
            tableView.style.display = 'none';
            cardView.style.display = 'block';
            tableViewBtn.classList.remove('active');
            cardViewBtn.classList.add('active');
        } else {
            tableView.style.display = 'block';
            cardView.style.display = 'none';
            tableViewBtn.classList.add('active');
            cardViewBtn.classList.remove('active');
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
                
                // Chamar função de ordenação se existir
                if (window.productLogManager && direction !== 'none') {
                    window.productLogManager.sortProducts(column, direction);
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
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.updateActiveFilters();
                    if (window.productLogManager) {
                        window.productLogManager.fetchLogs(1);
                    }
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
                    if (window.productLogManager) {
                        window.productLogManager.fetchLogs(1);
                    }
                });
            }
        });
    }

    clearFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('supermarketFilter').value = '';
        document.getElementById('dateFilter').value = '';
        document.getElementById('priceRange').value = '';
        
        // Limpar filtros ativos
        this.clearActiveFilters();
        
        // Recarregar dados
        if (window.productLogManager) {
            window.productLogManager.fetchLogs(1);
        }
    }

    applyFilters() {
        // Atualizar filtros ativos
        this.updateActiveFilters();
        
        // Recarregar dados
        if (window.productLogManager) {
            window.productLogManager.fetchLogs(1);
        }
    }

    updateActiveFilters() {
        const activeFilters = document.getElementById('activeFilters');
        activeFilters.innerHTML = '';
        
        const searchValue = document.getElementById('searchInput').value;
        const supermarketValue = document.getElementById('supermarketFilter').value;
        const dateValue = document.getElementById('dateFilter').value;
        const priceValue = document.getElementById('priceRange').value;
        
        if (searchValue) {
            this.addActiveFilter('Busca', searchValue, 'searchInput');
        }
        
        if (supermarketValue) {
            const supermarketText = document.getElementById('supermarketFilter').options[document.getElementById('supermarketFilter').selectedIndex].text;
            this.addActiveFilter('Supermercado', supermarketText, 'supermarketFilter');
        }
        
        if (dateValue) {
            this.addActiveFilter('Data', new Date(dateValue).toLocaleDateString('pt-BR'), 'dateFilter');
        }
        
        if (priceValue) {
            const priceText = document.getElementById('priceRange').options[document.getElementById('priceRange').selectedIndex].text;
            this.addActiveFilter('Faixa de Preço', priceText, 'priceRange');
        }
    }

    addActiveFilter(label, value, filterId) {
        const activeFilters = document.getElementById('activeFilters');
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
            document.getElementById(filterToRemove).value = '';
            filterElement.remove();
            
            // Recarregar dados
            if (window.productLogManager) {
                window.productLogManager.fetchLogs(1);
            }
            
            // Atualizar filtros ativos
            this.updateActiveFilters();
        });
    }

    clearActiveFilters() {
        const activeFilters = document.getElementById('activeFilters');
        activeFilters.innerHTML = '';
    }

    // Métodos para atualizar a UI
    showLoading() {
        const tableBody = document.querySelector('#productsTable tbody');
        const productsGrid = document.getElementById('productsGrid');
        
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;"><div class="loader"></div></td></tr>`;
        }
        
        if (productsGrid) {
            productsGrid.innerHTML = '<div class="loader-container"><div class="loader"></div><p>Carregando produtos...</p></div>';
        }
    }

    showError(message) {
        const tableBody = document.querySelector('#productsTable tbody');
        const productsGrid = document.getElementById('productsGrid');
        
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">${message}</td></tr>`;
        }
        
        if (productsGrid) {
            productsGrid.innerHTML = `<div class="empty-state">${message}</div>`;
        }
    }

    updatePagination(totalCount, currentPage, pageSize) {
        const totalPages = Math.ceil(totalCount / pageSize);
        
        // Atualizar informações da página
        const pageInfoElements = document.querySelectorAll('.page-info');
        pageInfoElements.forEach(element => {
            element.textContent = `Página ${currentPage} de ${totalPages > 0 ? totalPages : 1}`;
        });
        
        // Atualizar botões de paginação
        const prevButtons = document.querySelectorAll('#prevPageBtn, #prevPageBtnCard');
        const nextButtons = document.querySelectorAll('#nextPageBtn, #nextPageBtnCard');
        
        prevButtons.forEach(btn => {
            btn.disabled = currentPage <= 1;
        });
        
        nextButtons.forEach(btn => {
            btn.disabled = currentPage >= totalPages;
        });
        
        // Atualizar total de itens
        const totalItems
