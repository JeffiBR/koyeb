document.addEventListener('DOMContentLoaded', () => {
    // Elementos principais
    const barcodesInput = document.getElementById('barcodesInput');
    const supermarketGrid = document.getElementById('supermarketGrid');
    const compareButton = document.getElementById('compareButton');
    const resultsContainer = document.getElementById('resultsContainer');
    const loader = document.getElementById('loader');
    const emptyState = document.getElementById('emptyState');
    const productsList = document.getElementById('productsList');
    
    // Elementos do sumário
    const foundProducts = document.getElementById('foundProducts');
    const activeMarkets = document.getElementById('activeMarkets');
    const maxSaving = document.getElementById('maxSaving');
    const lastUpdate = document.getElementById('lastUpdate');

    // Controles de mercado
    const marketSearch = document.getElementById('marketSearch');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarkets = document.getElementById('selectAllMarkets');
    const deselectAllMarkets = document.getElementById('deselectAllMarkets');
    const selectedCount = document.getElementById('selectedCount');

    let allMarkets = [];
    let filteredMarkets = [];
    let selectedMarkets = new Set();
    let currentResults = [];

    // Inicialização
    initializePage();

    async function initializePage() {
        await loadSupermarkets();
        setupEventListeners();
        updateSelectionCount();
    }

    async function loadSupermarkets() {
        try {
            const response = await fetch(`/api/supermarkets/public`);
            if (!response.ok) throw new Error('Falha ao carregar mercados');
            
            allMarkets = await response.json();
            renderMarketGrid(allMarkets);
            filteredMarkets = [...allMarkets];
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
            showNotification('Erro ao carregar lista de mercados', 'error');
        }
    }

    function renderMarketGrid(markets) {
        supermarketGrid.innerHTML = '';
        
        if (markets.length === 0) {
            supermarketGrid.innerHTML = '<div class="empty-state">Nenhum mercado encontrado</div>';
            return;
        }

        markets.forEach(market => {
            const marketCard = document.createElement('div');
            marketCard.className = `market-card ${selectedMarkets.has(market.cnpj) ? 'selected' : ''}`;
            marketCard.innerHTML = `
                <div class="market-info">
                    <div class="market-name">${market.nome}</div>
                    <div class="market-cnpj">${market.cnpj}</div>
                </div>
            `;
            
            marketCard.addEventListener('click', () => toggleMarketSelection(market.cnpj));
            supermarketGrid.appendChild(marketCard);
        });
    }

    function toggleMarketSelection(cnpj) {
        if (selectedMarkets.has(cnpj)) {
            selectedMarkets.delete(cnpj);
        } else {
            selectedMarkets.add(cnpj);
        }
        updateSelectionCount();
        renderMarketGrid(filteredMarkets);
    }

    function updateSelectionCount() {
        selectedCount.textContent = `${selectedMarkets.size} selecionados`;
        compareButton.disabled = selectedMarkets.size < 2;
    }

    function setupEventListeners() {
        // Busca em tempo real nos códigos de barras
        barcodesInput.addEventListener('input', debounce(validateBarcodes, 500));
        
        // Busca em mercados
        marketSearch.addEventListener('input', debounce(filterMarkets, 300));
        clearMarketSearch.addEventListener('click', clearMarketSearchFilter);
        
        // Seleção em massa
        selectAllMarkets.addEventListener('click', selectAllFilteredMarkets);
        deselectAllMarkets.addEventListener('click', clearMarketSelection);
        
        // Comparação
        compareButton.addEventListener('click', searchCurrentPrices);
    }

    function validateBarcodes() {
        const barcodesText = barcodesInput.value.trim();
        if (!barcodesText) return;
        
        const barcodes = barcodesText.split(',').map(b => b.trim()).filter(b => b);
        
        if (barcodes.length > 10) {
            showNotification('Máximo de 10 códigos de barras permitidos', 'warning');
            barcodesInput.value = barcodes.slice(0, 10).join(', ');
        }
        
        // Valida formato básico de código de barras (apenas números)
        const invalidBarcodes = barcodes.filter(b => !/^\d+$/.test(b));
        if (invalidBarcodes.length > 0) {
            showNotification(`Códigos inválidos: ${invalidBarcodes.join(', ')}`, 'error');
        }
    }

    function filterMarkets() {
        const searchTerm = marketSearch.value.toLowerCase().trim();
        
        if (!searchTerm) {
            filteredMarkets = [...allMarkets];
        } else {
            filteredMarkets = allMarkets.filter(market => 
                market.nome.toLowerCase().includes(searchTerm) ||
                market.cnpj.includes(searchTerm)
            );
        }
        
        renderMarketGrid(filteredMarkets);
    }

    function clearMarketSearchFilter() {
        marketSearch.value = '';
        filterMarkets();
    }

    function selectAllFilteredMarkets() {
        filteredMarkets.forEach(market => selectedMarkets.add(market.cnpj));
        updateSelectionCount();
        renderMarketGrid(filteredMarkets);
    }

    function clearMarketSelection() {
        selectedMarkets.clear();
        updateSelectionCount();
        renderMarketGrid(filteredMarkets);
    }

    async function searchCurrentPrices() {
        const barcodesText = barcodesInput.value.trim();
        const selectedCnpjs = Array.from(selectedMarkets);
        
        if (!barcodesText) {
            showNotification('Insira pelo menos um código de barras', 'error');
            return;
        }
        
        if (selectedCnpjs.length < 2) {
            showNotification('Selecione pelo menos dois mercados', 'error');
            return;
        }

        const barcodes = barcodesText.split(',').map(b => b.trim()).filter(b => b);
        
        loader.style.display = 'flex';
        resultsContainer.style.display = 'none';
        emptyState.style.display = 'none';

        try {
            const session = await getSession();
            if (!session) {
                showNotification('Você precisa estar logado', 'error');
                return;
            }

            // Buscar preços atuais para todos os códigos usando a mesma API do search.html
            currentResults = [];
            
            for (const barcode of barcodes) {
                const productData = await fetchProductPrices(barcode, selectedCnpjs, session);
                if (productData && productData.prices.length > 0) {
                    currentResults.push(productData);
                }
            }

            if (currentResults.length === 0) {
                loader.style.display = 'none';
                emptyState.style.display = 'block';
                showNotification('Nenhum preço encontrado para os critérios informados', 'warning');
                return;
            }

            renderResults();
            updateSummary();
            
            resultsContainer.style.display = 'block';
            emptyState.style.display = 'none';
            
        } catch (error) {
            console.error('Erro na busca:', error);
            showNotification('Erro ao buscar preços atuais', 'error');
        } finally {
            loader.style.display = 'none';
        }
    }

    async function fetchProductPrices(barcode, cnpjs, session) {
        try {
            // Usar a mesma API de busca em tempo real do search.html
            const response = await authenticatedFetch('/api/realtime-search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    produto: barcode,
                    cnpjs: cnpjs
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro na requisição');
            }

            const data = await response.json();
            const results = data.results || [];

            if (results.length === 0) {
                return null;
            }

            // Processar resultados - agrupar por produto e calcular diferenças
            const productInfo = {
                nome: results[0].nome_produto || `Produto ${barcode}`,
                marca: results[0].marca || '',
                categoria: results[0].categoria || '',
                codigo_barras: barcode
            };

            const prices = results.map(item => ({
                marketCnpj: item.cnpj_supermercado,
                marketName: allMarkets.find(m => m.cnpj === item.cnpj_supermercado)?.nome || item.cnpj_supermercado,
                price: item.preco_produto || 0,
                lastUpdate: item.data_ultima_venda || new Date().toISOString(),
                available: item.disponivel || false
            }));

            // Calcular diferenças percentuais em relação ao menor preço
            const validPrices = prices.filter(p => p.price > 0);
            if (validPrices.length > 0) {
                const lowestPrice = Math.min(...validPrices.map(p => p.price));
                
                prices.forEach(priceData => {
                    if (priceData.price > 0 && lowestPrice > 0) {
                        priceData.percentageDifference = ((priceData.price - lowestPrice) / lowestPrice) * 100;
                    } else {
                        priceData.percentageDifference = 0;
                    }
                });
            }

            return {
                barcode,
                productInfo,
                prices: prices.sort((a, b) => a.price - b.price), // Ordenar do menor para o maior preço
                lowestPrice: validPrices.length > 0 ? Math.min(...validPrices.map(p => p.price)) : 0
            };
            
        } catch (error) {
            console.error(`Erro ao buscar preços para ${barcode}:`, error);
            return null;
        }
    }

    function renderResults() {
        productsList.innerHTML = '';
        
        currentResults.forEach(productData => {
            const productCard = createProductCard(productData);
            productsList.appendChild(productCard);
        });
    }

    function createProductCard(productData) {
        const card = document.createElement('div');
        card.className = 'product-comparison-card';
        
        const hasPrices = productData.prices.some(p => p.price > 0);
        const availableMarkets = productData.prices.filter(p => p.price > 0).length;
        
        card.innerHTML = `
            <div class="product-header">
                <div class="product-main-info">
                    <h4 class="product-name">${productData.productInfo.nome}</h4>
                    <div class="product-barcode">Código: ${productData.barcode}</div>
                </div>
                <div class="product-stats">
                    <span class="market-count">${availableMarkets} mercados</span>
                    ${productData.lowestPrice > 0 ? 
                        `<span class="lowest-price">Melhor: R$ ${productData.lowestPrice.toFixed(2)}</span>` : 
                        ''
                    }
                </div>
            </div>
            <div class="prices-comparison">
                ${hasPrices ? 
                    productData.prices.map(priceData => createPriceRow(priceData, productData.lowestPrice)).join('') 
                    : '<div class="no-prices">Nenhum preço disponível nos mercados selecionados</div>'
                }
            </div>
        `;
        
        return card;
    }

    function createPriceRow(priceData, lowestPrice) {
        if (priceData.price <= 0) {
            return `
                <div class="price-row unavailable">
                    <div class="market-info">
                        <span class="market-name">${priceData.marketName}</span>
                    </div>
                    <div class="price-info">
                        <span class="price-value">Indisponível</span>
                    </div>
                </div>
            `;
        }

        const isLowest = Math.abs(priceData.price - lowestPrice) < 0.01;
        const differenceClass = isLowest ? 'lowest' : priceData.percentageDifference > 0 ? 'higher' : 'equal';
        
        return `
            <div class="price-row ${differenceClass}">
                <div class="market-info">
                    <span class="market-name">${priceData.marketName}</span>
                </div>
                <div class="price-info">
                    <span class="price-value">R$ ${priceData.price.toFixed(2)}</span>
                    ${!isLowest ? 
                        `<span class="price-difference">+${priceData.percentageDifference.toFixed(1)}%</span>` 
                        : '<span class="best-price-tag">Melhor Preço</span>'
                    }
                </div>
            </div>
        `;
    }

    function updateSummary() {
        // Produtos encontrados
        foundProducts.textContent = currentResults.length;
        
        // Mercados com preços
        const marketsWithPrices = new Set();
        currentResults.forEach(product => {
            product.prices.forEach(price => {
                if (price.price > 0) {
                    marketsWithPrices.add(price.marketCnpj);
                }
            });
        });
        activeMarkets.textContent = marketsWithPrices.size;
        
        // Maior economia
        let maxSavingValue = 0;
        currentResults.forEach(product => {
            if (product.prices.length >= 2) {
                const prices = product.prices.filter(p => p.price > 0).map(p => p.price);
                if (prices.length >= 2) {
                    const minPrice = Math.min(...prices);
                    const maxPrice = Math.max(...prices);
                    const saving = ((maxPrice - minPrice) / maxPrice) * 100;
                    if (saving > maxSavingValue) {
                        maxSavingValue = saving;
                    }
                }
            }
        });
        maxSaving.textContent = maxSavingValue > 0 ? `${maxSavingValue.toFixed(1)}%` : '-';
        
        // Última atualização
        lastUpdate.textContent = new Date().toLocaleTimeString();
    }

    // Funções utilitárias
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : 
                    type === 'error' ? 'fa-exclamation-circle' : 
                    type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
        notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, type === 'success' ? 3000 : 5000);
    }
});
