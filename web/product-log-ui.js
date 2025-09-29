// product-log-ui.js - Gerenciamento da interface do usuário
class ProductLogUI {
    constructor() {
        this.searchTimeout = null;
        this.originalFetchLogs = null;
        this.isInitialized = false;
        this.init();
    }

    init() {
        // Aguardar o DOM estar pronto e o product-log.js carregar
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        // Aguardar um pouco para garantir que o product-log.js foi carregado
        setTimeout(() => {
            this.setupEventListeners();
            this.setupTheme();
            this.setupViewToggle();
            this.setupFilters();
            this.setupExportButton();
            this.interceptFetchLogs();
            this.isInitialized = true;
            console.log('ProductLogUI inicializado');
        }, 500);
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
                
                // Atualizar ordenação global e recarregar
                if (window.currentSort && direction !== 'none') {
                    window.currentSort.column = column;
                    window.currentSort.direction = direction;
                    this.applyFilters();
                }
            });
        });
    }

    setupFilters() {
        console.log('Configurando filtros...');

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
                }, 800);
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

    interceptFetchLogs() {
        // Salvar a função original
        this.originalFetchLogs = window.fetchLogs;
        
        if (this.originalFetchLogs && typeof this.originalFetchLogs === 'function') {
            // Substituir a função global fetchLogs
            window.fetchLogs = async (page) => {
                console.log('Interceptando fetchLogs com filtros...');
                
                try {
                    const session = await getSession();
                    if (!session) {
                        return;
                    }
                    
                    // Construir query parameters com filtros e ordenação
                    const params = new URLSearchParams({
                        page: page || 1,
                        page_size: window.pageSize || 50,
                        sort_by: window.currentSort?.column || 'data_ultima_venda',
                        sort_order: window.currentSort?.direction || 'desc'
                    });
                    
                    // Adicionar nossos filtros
                    this.addFiltersToParams(params);
                    
                    console.log('Parâmetros da requisição:', params.toString());

                    // Mostrar loading
                    this.showLoading();

                    const response = await fetch(`/api/products-log?${params}`, {
                        headers: {
                            'Authorization': `Bearer ${session.access_token}`
                        }
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.detail || 'Falha ao carregar o log de produtos.');
                    }
                    
                    const result = await response.json();
                    const products = result.data;
                    window.totalCount = result.total_count || 0;
                    
                    // Chamar as funções de renderização originais
                    this.renderTable(products);
                    this.renderCards(products);
                    this.updatePaginationControls();
                    this.updateTotalItems();

                } catch (error) {
                    console.error('Erro ao carregar log de produtos:', error);
                    this.showError(error.message);
                }
            };

            console.log('fetchLogs interceptado com sucesso');
        } else {
            console.warn('Função fetchLogs não encontrada no escopo global');
        }
    }

    addFiltersToParams(params) {
        const searchValue = document.getElementById('searchInput')?.value.trim();
        const supermarketValue = document.getElementById('supermarketFilter')?.value;
        const dateValue = document.getElementById('dateFilter')?.value;
        const priceValue = document.getElementById('priceRange')?.value;

        console.log('Filtros ativos:', {
            search: searchValue,
            supermarket: supermarketValue,
            date: dateValue,
            priceRange: priceValue
        });

        if (searchValue) params.append('search', searchValue);
        if (supermarketValue) params.append('supermarket', supermarketValue);
        if (dateValue) params.append('date', dateValue);
        if (priceValue) params.append('price_range', priceValue);
    }

    clearFilters() {
        console.log('Limpando filtros...');
        
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
        console.log('Aplicando filtros...');
        
        // Resetar para primeira página
        if (window.currentPage) {
            window.currentPage = 1;
        }
        
        // Recarregar dados usando nossa função interceptada
        if (window.fetchLogs) {
            window.fetchLogs(window.currentPage || 1);
        } else {
            console.warn('fetchLogs não disponível');
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
                filterElement.dispatchEvent(new Event('change'));
            }
            
            // Recarregar dados
            this.applyFilters();
        });
    }

    clearActiveFilters() {
        const activeFilters = document.getElementById('activeFilters');
        if (activeFilters) {
            activeFilters.innerHTML = '';
        }
    }

    // Funções de renderização compatíveis com o product-log.js original
    renderTable(products) {
        const tableBody = document.querySelector('#productsTable tbody');
        if (!tableBody) return;

        tableBody.innerHTML = '';

        if (products.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum produto encontrado.</td></tr>';
        } else {
            products.forEach(product => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${product.nome_produto || 'N/A'}</td>
                    <td style="font-weight: 600; color: var(--primary);">${this.formatarPreco(product.preco_produto)}</td>
                    <td>${product.nome_supermercado || 'N/A'}</td>
                    <td>${this.formatarData(product.data_ultima_venda)}</td>
                    <td>${product.codigo_barras || 'N/A'}</td>
                    <td><span class="coleta-badge">#${product.coleta_id}</span></td>
                `;
                tableBody.appendChild(row);
            });
        }
    }

    renderCards(products) {
        const productsGrid = document.getElementById('productsGrid');
        if (!productsGrid) return;

        productsGrid.innerHTML = '';

        if (products.length === 0) {
            productsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>Nenhum produto encontrado</h3>
                    <p>Tente ajustar os filtros para ver mais resultados.</p>
                </div>
            `;
        } else {
            products.forEach(product => {
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <div class="product-header">
                        <div class="product-name">${product.nome_produto || 'Produto sem nome'}</div>
                        <div class="product-price">${this.formatarPreco(product.preco_produto)}</div>
                    </div>
                    <div class="product-details">
                        <div class="product-detail">
                            <i class="fas fa-store"></i>
                            <span>${product.nome_supermercado || 'N/A'}</span>
                        </div>
                        <div class="product-detail">
                            <i class="fas fa-calendar"></i>
                            <span>${this.formatarData(product.data_ultima_venda)}</span>
                        </div>
                        <div class="product-detail">
                            <i class="fas fa-barcode"></i>
                            <span>${product.codigo_barras || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="product-footer">
                        <div class="coleta-badge">Coleta #${product.coleta_id}</div>
                    </div>
                `;
                productsGrid.appendChild(card);
            });
        }
    }

    formatarData(dataISO) {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }
    
    formatarPreco(preco) {
        if (typeof preco !== 'number') return 'N/A';
        return `R$ ${preco.toFixed(2).replace('.', ',')}`;
    }

    updatePaginationControls() {
        const totalPages = Math.ceil((window.totalCount || 0) / (window.pageSize || 50));
        const pageInfo = document.getElementById('pageInfo');
        const pageInfoCard = document.getElementById('pageInfoCard');
        
        if (pageInfo) pageInfo.textContent = `Página ${window.currentPage || 1} de ${totalPages > 0 ? totalPages : 1}`;
        if (pageInfoCard) pageInfoCard.textContent = `Página ${window.currentPage || 1} de ${totalPages > 0 ? totalPages : 1}`;
        
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');
        const prevPageBtnCard = document.getElementById('prevPageBtnCard');
        const nextPageBtnCard = document.getElementById('nextPageBtnCard');
        
        if (prevPageBtn) prevPageBtn.disabled = (window.currentPage || 1) <= 1;
        if (nextPageBtn) nextPageBtn.disabled = (window.currentPage || 1) >= totalPages;
        if (prevPageBtnCard) prevPageBtnCard.disabled = (window.currentPage || 1) <= 1;
        if (nextPageBtnCard) nextPageBtnCard.disabled = (window.currentPage || 1) >= totalPages;
    }

    updateTotalItems() {
        const totalItems = document.getElementById('totalItems');
        const totalItemsCard = document.getElementById('totalItemsCard');
        
        if (totalItems) totalItems.textContent = `Total: ${window.totalCount || 0} produtos`;
        if (totalItemsCard) totalItemsCard.textContent = `Total: ${window.totalCount || 0} produtos`;
    }

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

    async exportData() {
        try {
            const session = await getSession();
            if (!session) return;

            // Construir parâmetros de filtro atuais
            const params = new URLSearchParams();
            this.addFiltersToParams(params);

            // Adicionar outros parâmetros necessários
            params.append('page_size', '10000'); // Exportar todos

            const response = await fetch(`/api/products-log?${params}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                this.exportToCSV(result.data);
                this.showNotification('Exportação realizada com sucesso!', 'success');
            } else {
                throw new Error('Falha ao exportar dados');
            }
        } catch (error) {
            console.error('Erro ao exportar dados:', error);
            this.showNotification('Erro ao exportar dados', 'error');
        }
    }

    exportToCSV(data) {
        if (!data || data.length === 0) {
            this.showNotification('Nenhum dado para exportar', 'error');
            return;
        }

        const headers = ['Produto', 'Preço', 'Supermercado', 'Data Venda', 'Código Barras', 'Coleta ID'];
        const csvContent = [
            headers.join(','),
            ...data.map(item => [
                `"${(item.nome_produto || '').replace(/"/g, '""')}"`,
                item.preco_produto || '',
                `"${(item.nome_supermercado || '').replace(/"/g, '""')}"`,
                `"${this.formatarData(item.data_ultima_venda)}"`,
                item.codigo_barras || '',
                item.coleta_id || ''
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `produtos_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    showNotification(message, type = 'info') {
        // Criar elemento de notificação
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}"></i>
            <span>${message}</span>
        `;
        
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
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    window.productLogUI = new ProductLogUI();
});
