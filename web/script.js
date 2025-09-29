document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI (Mapeados para o seu novo HTML) ---
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const realtimeSearchButton = document.getElementById('realtimeSearchButton');
    const clearSearchButton = document.getElementById('clearSearchButton');
    const resultsGrid = document.getElementById('resultsGrid');
    const loader = document.getElementById('loader');

    // Filtros de Supermercado
    const supermarketFiltersContainer = document.getElementById('supermarketFilters');
    const marketSearchInput = document.getElementById('marketSearchInput');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarketsBtn = document.getElementById('selectAllMarkets');
    const deselectAllMarketsBtn = document.getElementById('deselectAllMarkets');
    const selectionCountSpan = document.querySelector('.selection-count');

    // Filtros de Resultados
    const resultsFiltersPanel = document.getElementById('resultsFilters');
    const marketFilterDropdown = document.getElementById('marketFilter');
    const sortFilterDropdown = document.getElementById('sortFilter');
    const clearFiltersButton = document.getElementById('clearFiltersButton');

    // --- ESTADO DA APLICAÇÃO ---
    let currentResults = [];
    let allMarkets = [];

    // --- FUNÇÕES DE UI E RENDERIZAÇÃO ---
    const showLoader = (show) => {
        if(loader) loader.style.display = show ? 'flex' : 'none';
    };
    
    const showMessage = (msg, isError = false) => {
        resultsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1">
                <h3 style="${isError ? 'color: var(--error);' : ''}">${msg}</h3>
                <p>Tente ajustar os termos da busca ou filtros.</p>
            </div>`;
    };

    const showNotification = (message, type = 'success') => {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    };

    const updateSelectionCount = () => {
        const selected = document.querySelectorAll('.market-card.selected').length;
        if (selectionCountSpan) selectionCountSpan.textContent = `${selected} selecionados`;
    };

    const buildProductCard = (item, allItemsInResult) => {
        const price = typeof item.preco_produto === 'number' ? `R$ ${item.preco_produto.toFixed(2).replace('.', ',')}` : 'N/A';
        const date = item.data_ultima_venda ? new Date(item.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
        const prices = allItemsInResult.map(r => r.preco_produto).filter(p => typeof p === 'number');
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        let priceClass = '';
        if (prices.length > 1 && item.preco_produto === minPrice) {
            priceClass = 'cheapest-price';
        }
        return `<div class="product-card ${priceClass}" data-price="${item.preco_produto || 0}"><div class="card-header"><div class="product-name">${item.nome_produto || 'Produto sem nome'}</div></div><div class="price-section"><div class="product-price">${price}</div></div><ul class="product-details"><li><i class="fas fa-store"></i> <span class="supermarket-name">${item.nome_supermercado}</span></li><li><i class="fas fa-weight-hanging"></i> ${item.tipo_unidade || 'UN'} (${item.unidade_medida || 'N/A'})</li><li><i class="fas fa-calendar-alt"></i> <span class="sale-date">Última Venda: ${date}</span></li><li><i class="fas fa-barcode"></i> ${item.codigo_barras || 'Sem código'}</li></ul></div>`;
    };

    const applyFilters = () => {
        if (currentResults.length === 0) return;
        let filteredResults = [...currentResults];
        const selectedMarket = marketFilterDropdown.value;
        if (selectedMarket !== 'all') {
            filteredResults = filteredResults.filter(item => item.cnpj_supermercado === selectedMarket);
        }
        const sortBy = sortFilterDropdown.value;
        switch(sortBy) {
            case 'cheap': filteredResults.sort((a, b) => (a.preco_produto || Infinity) - (b.preco_produto || Infinity)); break;
            case 'expensive': filteredResults.sort((a, b) => (b.preco_produto || 0) - (a.preco_produto || 0)); break;
            case 'name': filteredResults.sort((a, b) => (a.nome_produto || '').localeCompare(b.nome_produto || '')); break;
            case 'recent': default: filteredResults.sort((a, b) => new Date(b.data_ultima_venda) - new Date(a.data_ultima_venda)); break;
        }
        displayFilteredResults(filteredResults);
    };

    const displayFilteredResults = (results) => {
        if (results.length === 0) {
            resultsGrid.innerHTML = `<div class="empty-state"><h3>Nenhum resultado encontrado</h3><p>Tente ajustar os filtros aplicados</p></div>`;
            return;
        }
        const frag = document.createDocumentFragment();
        results.forEach((item) => {
            const div = document.createElement('div');
            div.innerHTML = buildProductCard(item, results);
            frag.appendChild(div.firstElementChild);
        });
        resultsGrid.innerHTML = '';
        resultsGrid.appendChild(frag);
    };

    const updateMarketFilter = (results) => {
        marketFilterDropdown.innerHTML = '<option value="all">Todos os mercados</option>';
        const markets = {};
        results.forEach(item => {
            if (item.cnpj_supermercado && item.nome_supermercado) {
                markets[item.cnpj_supermercado] = item.nome_supermercado;
            }
        });
        Object.entries(markets).forEach(([cnpj, nome]) => {
            const option = document.createElement('option');
            option.value = cnpj;
            option.textContent = nome;
            marketFilterDropdown.appendChild(option);
        });
    };

    // --- LÓGICA DE BUSCA E INICIALIZAÇÃO ---
    const loadSupermarkets = async () => {
        try {
            const response = await fetch(`/api/supermarkets/public`);
            if (!response.ok) throw new Error('Falha ao carregar mercados.');
            allMarkets = await response.json();
            renderMarketFilters(allMarkets);
        } catch (error) {
            console.error(error);
            supermarketFiltersContainer.innerHTML = '<p style="color: red;">Não foi possível carregar os filtros.</p>';
        }
    };
    
    const renderMarketFilters = (marketsToRender) => {
        supermarketFiltersContainer.innerHTML = '';
        marketsToRender.forEach(market => {
            const card = document.createElement('div');
            card.className = 'market-card';
            card.innerHTML = `<input type="checkbox" name="supermarket" value="${market.cnpj}" style="display: none;"><div class="market-info"><div class="market-name">${market.nome}</div><div class="market-cnpj">${market.cnpj}</div></div>`;
            card.addEventListener('click', (e) => {
                const checkbox = card.querySelector('input');
                checkbox.checked = !checkbox.checked;
                card.classList.toggle('selected', checkbox.checked);
                updateSelectionCount();
            });
            supermarketFiltersContainer.appendChild(card);
        });
        updateSelectionCount();
    };

    const performSearch = async (isRealtime = false) => {
        const query = searchInput.value.trim();
        if (query.length < 3) {
            showMessage('Digite pelo menos 3 caracteres.'); return;
        }
        const selectedCnpjs = Array.from(document.querySelectorAll('input[name="supermarket"]:checked')).map(cb => cb.value);
        if (isRealtime && selectedCnpjs.length === 0) {
            showMessage('Selecione ao menos um supermercado para busca em tempo real.'); return;
        }

        showLoader(true);
        resultsGrid.innerHTML = '';
        currentResults = [];
        resultsFilters.style.display = 'none';

        try {
            let response;
            // AQUI ESTÁ A CORREÇÃO: Usamos a função `authenticatedFetch` do auth.js
            // para TODAS as buscas, garantindo que o token seja enviado e o logout não ocorra.
            if (isRealtime) {
                response = await authenticatedFetch('/api/realtime-search', { 
                    method: 'POST', 
                    body: JSON.stringify({ produto: query, cnpjs: selectedCnpjs }) 
                });
            } else {
                let url = `/api/search?q=${encodeURIComponent(query)}`;
                if (selectedCnpjs.length > 0) url += `&${selectedCnpjs.map(cnpj => `cnpjs=${cnpj}`).join('&')}`;
                response = await authenticatedFetch(url);
            }

            if (!response.ok) { 
                const err = await response.json();
                throw new Error(err.detail || `Erro ${response.status} na API.`);
            }
            
            const data = await response.json();
            currentResults = data.results || [];
            
            if (currentResults.length === 0) {
                showMessage(`Nenhum resultado encontrado para "${query}".`);
            } else {
                resultsFilters.style.display = 'block';
                updateMarketFilter(currentResults);
                applyFilters();
            }
        } catch (error) {
            console.error(error);
            showMessage(`Erro na busca: ${error.message}`, true);
        } finally {
            showLoader(false);
        }
    };

    // --- EVENTOS ---
    searchButton.addEventListener('click', () => performSearch(false));
    realtimeSearchButton.addEventListener('click', () => performSearch(true));
    searchInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') performSearch(false); });
    clearSearchButton.addEventListener('click', () => { searchInput.value = ''; resultsGrid.innerHTML = ''; resultsFilters.style.display = 'none'; });
    marketFilter.addEventListener('change', applyFilters);
    sortFilter.addEventListener('change', applyFilters);
    clearFiltersButton.addEventListener('click', () => { marketFilter.value = 'all'; sortFilter.value = 'recent'; applyFilters(); });
    marketSearchInput.addEventListener('input', (e) => filterMarkets(e.target.value));
    selectAllMarkets.addEventListener('click', () => {
        document.querySelectorAll('.market-card input').forEach(cb => { cb.checked = true; cb.parentElement.classList.add('selected'); });
        updateSelectionCount();
    });
    deselectAllMarkets.addEventListener('click', () => {
        document.querySelectorAll('.market-card input').forEach(cb => { cb.checked = false; cb.parentElement.classList.remove('selected'); });
        updateSelectionCount();
    });

    loadSupermarkets();

    // --- EXPOR RESULTADOS E NOTIFICAR PRICE-SORTER ---
    window.getCurrentResults = () => currentResults;

    const originalDisplayFilteredResults = window.displayFilteredResults;
    window.displayFilteredResults = function(results) {
        if (originalDisplayFilteredResults) {
            originalDisplayFilteredResults(results);
        }
        
        setTimeout(() => {
            if (window.priceSorter && typeof window.priceSorter.handleNewResults === 'function') {
                window.priceSorter.handleNewResults(results);
            }
        }, 100);
    };
});
