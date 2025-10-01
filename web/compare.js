document.addEventListener('DOMContentLoaded', () => {
    // Elementos principais
    const productsInput = document.getElementById('productsInput');
    const inputInfoText = document.getElementById('inputInfoText');
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
        updateCompareButtonState();
    }

    function updateCompareButtonState() {
        const productsText = productsInput.value.trim();
        const hasProducts = productsText.length > 0;
        const hasMarkets = selectedMarkets.size >= 2;
        
        compareButton.disabled = !(hasProducts && hasMarkets);
    }

    function setupEventListeners() {
        // Busca em tempo real nos produtos
        productsInput.addEventListener('input', debounce(validateProductsInput, 500));
        
        // Busca em mercados
        marketSearch.addEventListener('input', debounce(filterMarkets, 300));
        clearMarketSearch.addEventListener('click', clearMarketSearchFilter);
        
        // Seleção em massa
        selectAllMarkets.addEventListener('click', selectAllFilteredMarkets);
        deselectAllMarkets.addEventListener('click', clearMarketSelection);
        
        // Comparação
        compareButton.addEventListener('click', searchCurrentPrices);
    }

    function validateProductsInput() {
        const productsText = productsInput.value.trim();
        
        if (!productsText) {
            inputInfoText.textContent = 'Insere até 5 produtos (códigos de barras ou nomes)';
            updateCompareButtonState();
            return;
        }
        
        // Separar produtos por vírgula
        const products = productsText.split(',').map(p => p.trim()).filter(p => p);
        
        // Verificar limite de produtos
        if (products.length > 5) {
            showNotification('Máximo de 5 produtos permitidos', 'warning');
            productsInput.value = products.slice(0, 5).join(', ');
            inputInfoText.textContent = `Limite de 5 produtos atingido (${products.length} inseridos)`;
            updateCompareButtonState();
            return;
        }
        
        // Validar cada produto
        const validationResults = products.map(validateProduct);
        const invalidProducts = validationResults.filter(r => !r.valid);
        
        if (invalidProducts.length > 0) {
            const invalidNames = invalidProducts.map(p => p.product).join(', ');
            inputInfoText.textContent = `Produtos inválidos: ${invalidNames}`;
            showNotification(`Produtos inválidos: ${invalidNames}`, 'error');
        } else {
            const barcodesCount = validationResults.filter(r => r.type === 'barcode').length;
            const namesCount = validationResults.filter(r => r.type === 'name').length;
            
            inputInfoText.textContent = `${products.length} produtos válidos (${barcodesCount} códigos, ${namesCount} nomes)`;
        }
        
        updateCompareButtonState();
    }

    function validateProduct(product) {
        // Verificar se é código de barras (apenas números)
        if (/^\d+$/.test(product)) {
            // Validar comprimento do código de barras
            if (product.length >= 8 && product.length <= 13) {
                return { product, valid: true, type: 'barcode' };
            } else {
                return { product, valid: false, type: 'barcode', error: 'Código deve ter 8-13 dígitos' };
            }
        } 
        // Verificar se é nome de produto (contém letras)
        else if (/[a-zA-ZÀ-ÿ]/.test(product)) {
            // Validar comprimento do nome
            if (product.length >= 3) {
                return { product, valid: true, type: 'name' };
            } else {
                return { product, valid: false, type: 'name', error: 'Nome deve ter pelo menos 3 caracteres' };
            }
        }
        // Produto inválido
        else {
            return { product, valid: false, type: 'unknown', error: 'Formato não reconhecido' };
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
        const productsText = productsInput.value.trim();
        const selectedCnpjs = Array.from(selectedMarkets);
        
        if (!productsText) {
            showNotification('Insira produtos para comparar', 'error');
            return;
        }
        
        if (selectedCnpjs.length < 2) {
            showNotification('Selecione pelo menos dois mercados', 'error');
            return;
        }

        // Validar produtos antes da busca
        const products = productsText.split(',').map(p => p.trim()).filter(p => p);
        const validationResults = products.map(validateProduct);
        const invalidProducts = validationResults.filter(r => !r.valid);
        
        if (invalidProducts.length > 0) {
            const invalidNames = invalidProducts.map(p => p.product).join(', ');
            showNotification(`Produtos inválidos: ${invalidNames}`, 'error');
            return;
        }

        loader.style.display = 'flex';
        resultsContainer.style.display = 'none';
        emptyState.style.display = 'none';

        try {
            const session = await getSession();
            if (!session) {
                showNotification('Você precisa estar logado', 'error');
                return;
            }

            currentResults = [];
            
            // Buscar cada produto
            for (const product of products) {
                const validation = validateProduct(product);
                const searchType = validation.type === 'barcode' ? 'barcode' : 'name';
                
                const productData = await fetchProductPrices(product, selectedCnpjs, session, searchType);
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

    async function fetchProductPrices(searchTerm, cnpjs, session, searchType = 'barcode') {
        try {
            const requestBody = searchType === 'barcode' 
                ? { produto: searchTerm, cnpjs: cnpjs }
                : { nome_produto: searchTerm, cnpjs: cnpjs };

            const response = await authenticatedFetch('/api/realtime-search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(requestBody)
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

            // Agrupar por produto (para busca por nome pode retornar múltiplos produtos)
            const productsMap = new Map();
            
            results.forEach(item => {
                const productKey = item.codigo_barras || item.nome_produto;
                if (!productsMap.has(productKey)) {
                    productsMap.set(productKey, {
                        nome: item.nome_produto || `Produto ${searchTerm}`,
                        marca: item.marca || '',
                        categoria: item.categoria || '',
                        codigo_barras: item.codigo_barras || '',
                        prices: []
                    });
                }
                
                const product = productsMap.get(productKey);
                product.prices.push({
                    marketCnpj: item.cnpj_supermercado,
                    marketName: allMarkets.find(m => m.cnpj === item.cnpj_supermercado)?.nome || item.cnpj_supermercado,
                    price: item.preco_produto || 0,
                    lastUpdate: item.data_ultima_venda || new Date().toISOString(),
                    available: item.disponivel || false,
                    lastSaleDate: item.data_ultima_venda ? formatLastSaleDate(item.data_ultima_venda) : 'Data não disponível'
                });
            });

            // Processar cada produto encontrado
            const productsData = [];
            for (const [productKey, productInfo] of productsMap) {
                const prices = productInfo.prices;
                
                // Calcular diferenças percentuais
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

                productsData.push({
                    barcode: productInfo.codigo_barras,
                    searchTerm: searchTerm,
                    searchType: searchType,
                    productInfo: productInfo,
                    prices: prices.sort((a, b) => a.price - b.price),
                    lowestPrice: validPrices.length > 0 ? Math.min(...validPrices.map(p => p.price)) : 0
                });
            }
            
            return productsData.length > 0 ? productsData[0] : null;
            
        } catch (error) {
            console.error(`Erro ao buscar preços para ${searchTerm}:`, error);
            return null;
        }
    }

    function formatLastSaleDate(dateString) {
        if (!dateString) return 'Data não disponível';
        
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                return 'Ontem ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else if (diffDays <= 7) {
                return `Há ${diffDays} dias`;
            } else {
                return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            }
        } catch (e) {
            return 'Data não disponível';
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
        
        // Determinar tipo de busca para exibição
        const searchTypeLabel = productData.searchType === 'barcode' 
            ? `Código: ${productData.barcode}` 
            : 'Busca por nome';
        
        card.innerHTML = `
            <div class="product-header">
                <div class="product-main-info">
                    <h4 class="product-name">${productData.productInfo.nome}</h4>
                    <div class="product-barcode">${searchTypeLabel}</div>
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
                        <span class="last-sale-date">${priceData.lastSaleDate}</span>
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
                    <span class="last-sale-date">${priceData.lastSaleDate}</span>
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
