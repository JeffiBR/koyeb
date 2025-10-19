// cesta-comprar.js - VERSÃO COM BARRA DE PROGRESSO
// Corrigindo cálculo do valor total e quantidade de produtos

let buyBasketModal;
let marketDetailsModal;
let bestBasketModal;

// Variáveis para controle de mercados
let allMarkets = [];
let filteredMarkets = [];
let selectedMarkets = new Set();

// Variáveis para controle de progresso
let progressInterval;
let currentProgress = 0;
let currentStep = 0;
const totalSteps = 4; // Inicialização, Busca, Processamento, Finalização

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar modais
    buyBasketModal = document.getElementById('buyBasketModal');
    marketDetailsModal = document.getElementById('marketDetailsModal');
    
    // Fechar modais ao clicar no X
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
    
    // Fechar modais ao clicar fora
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });
    
    // Event listener para o formulário de comparação
    document.getElementById('btnCompareBasket').addEventListener('click', handleCompareBasket);
});

/**
 * Abre o modal de compra com a interface de seleção de mercados
 */
function openBuyBasketModal(basketId, basketName) {
    currentBasketId = parseInt(basketId);
    const basket = allBaskets.find(b => b.id === currentBasketId);
    
    if (basket) {
        currentBasketProducts = basket.produtos || [];
        document.getElementById('buyBasketName').textContent = basketName;
        
        // Verificar se há produtos com código de barras
        const productsWithBarcode = currentBasketProducts.filter(p => p.codigo_barras);
        if (productsWithBarcode.length === 0) {
            showNotification('Esta cesta não possui produtos com código de barras para busca.', 'warning');
            return;
        }
        
        // Inicializar a interface de mercados
        initializeMarketsInterface();
        buyBasketModal.style.display = 'block';
    }
}

/**
 * Inicializa a interface de seleção de mercados
 */
async function initializeMarketsInterface() {
    // Elementos da interface
    const supermarketGrid = document.getElementById('supermarketGrid');
    const marketSearch = document.getElementById('marketSearch');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarkets = document.getElementById('selectAllMarkets');
    const deselectAllMarkets = document.getElementById('deselectAllMarkets');
    const selectedMarketsCount = document.getElementById('selectedMarketsCount');
    const btnCompareBasket = document.getElementById('btnCompareBasket');

    // Limpar seleções anteriores
    selectedMarkets.clear();
    filteredMarkets = [];

    try {
        // Carregar lista de mercados
        const response = await authenticatedFetch('/api/supermarkets/public');
        if (!response.ok) throw new Error('Falha ao carregar mercados');
        
        allMarkets = await response.json();
        renderMarketGrid(allMarkets);
        filteredMarkets = [...allMarkets];
        
    } catch (error) {
        console.error('Erro ao carregar mercados:', error);
        showNotification('Erro ao carregar lista de mercados', 'error');
        return;
    }

    // Configurar event listeners
    function setupEventListeners() {
        // Busca em mercados
        marketSearch.addEventListener('input', debounce(filterMarkets, 300));
        clearMarketSearch.addEventListener('click', clearMarketSearchFilter);
        
        // Seleção em massa
        selectAllMarkets.addEventListener('click', selectAllFilteredMarkets);
        deselectAllMarkets.addEventListener('click', clearMarketSelection);
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
                    <div class="market-address">${market.endereco || 'Endereço não disponível'}</div>
                </div>
            `;
            
            marketCard.addEventListener('click', () => toggleMarketSelection(market.cnpj));
            supermarketGrid.appendChild(marketCard);
        });
        
        updateCompareButtonState();
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
        selectedMarketsCount.textContent = `${selectedMarkets.size} selecionados`;
        updateCompareButtonState();
    }

    function updateCompareButtonState() {
        const hasMarkets = selectedMarkets.size >= 1;
        const hasProductsWithBarcode = currentBasketProducts.filter(p => p.codigo_barras).length > 0;
        
        btnCompareBasket.disabled = !(hasMarkets && hasProductsWithBarcode);
    }

    function filterMarkets() {
        const searchTerm = marketSearch.value.toLowerCase().trim();
        
        if (!searchTerm) {
            filteredMarkets = [...allMarkets];
        } else {
            filteredMarkets = allMarkets.filter(market => 
                market.nome.toLowerCase().includes(searchTerm) ||
                (market.endereco && market.endereco.toLowerCase().includes(searchTerm)) ||
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

    // Inicializar
    setupEventListeners();
    updateSelectionCount();
    updateCompareButtonState();
}

/**
 * Lida com a comparação de preços da cesta por código de barras
 */
async function handleCompareBasket() {
    const selectedCnpjs = Array.from(selectedMarkets);
    
    if (selectedCnpjs.length === 0) {
        showNotification('Selecione pelo menos um mercado para comparar', 'error');
        return;
    }
    
    if (currentBasketProducts.length === 0) {
        showNotification('A cesta selecionada não possui produtos.', 'warning');
        return;
    }
    
    // Verificar se há produtos com código de barras
    const productsWithBarcode = currentBasketProducts.filter(p => p.codigo_barras);
    if (productsWithBarcode.length === 0) {
        showNotification('Nenhum produto na cesta possui código de barras para busca.', 'warning');
        return;
    }

    const btn = document.getElementById('btnCompareBasket');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Comparando...';
    
    // Fechar modal
    buyBasketModal.style.display = 'none';
    
    // Mostrar área de resultados com barra de progresso
    document.getElementById('resultsTitle').style.display = 'block';
    showProgressBar(productsWithBarcode.length, selectedCnpjs.length);
    
    try {
        // Buscar preços por código de barras
        const results = await searchBasketByBarcode(productsWithBarcode, selectedCnpjs);
        renderBasketComparison(results, selectedCnpjs, productsWithBarcode);
        
        showNotification('Comparação de preços concluída!', 'success');
        
    } catch (error) {
        console.error("Erro na comparação de cesta:", error);
        hideProgressBar();
        document.getElementById('realtimeResults').innerHTML = `
            <div class="result-message error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erro ao comparar preços: ${error.message}</p>
            </div>
        `;
        showNotification(`Erro na comparação: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-shopping-cart"></i> Comparar Cesta Básica';
    }
}

/**
 * Mostra a barra de progresso durante a comparação
 */
function showProgressBar(totalProducts, totalMarkets) {
    const progressHtml = `
        <div class="progress-container" id="progressContainer">
            <div class="progress-header">
                <h4><i class="fas fa-sync-alt fa-spin"></i> Comparando Preços</h4>
                <p>Buscando preços por código de barras em ${totalMarkets} mercado(s)</p>
            </div>
            
            <div class="progress-track">
                <div class="progress-step active" data-step="1">
                    <div class="step-icon">
                        <i class="fas fa-cog"></i>
                    </div>
                    <div class="step-label">Inicializando</div>
                </div>
                <div class="progress-step" data-step="2">
                    <div class="step-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <div class="step-label">Buscando Preços</div>
                </div>
                <div class="progress-step" data-step="3">
                    <div class="step-icon">
                        <i class="fas fa-chart-bar"></i>
                    </div>
                    <div class="step-label">Processando Dados</div>
                </div>
                <div class="progress-step" data-step="4">
                    <div class="step-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="step-label">Finalizando</div>
                </div>
            </div>
            
            <div class="progress-bar-container">
                <div class="progress-info">
                    <span class="progress-text" id="progressText">Inicializando comparação...</span>
                    <span class="progress-percentage" id="progressPercentage">0%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-bar-fill" id="progressBarFill" style="width: 0%"></div>
                </div>
                <div class="progress-details" id="progressDetails">
                    <i class="fas fa-info-circle"></i>
                    <span>Preparando para buscar ${totalProducts} produtos em ${totalMarkets} mercados</span>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('realtimeResults').innerHTML = progressHtml;
    
    // Iniciar animação de progresso
    startProgressAnimation(totalProducts, totalMarkets);
}

/**
 * Inicia a animação da barra de progresso
 */
function startProgressAnimation(totalProducts, totalMarkets) {
    currentProgress = 0;
    currentStep = 1;
    
    // Atualizar etapa inicial
    updateProgressStep(1, 'Inicializando comparação...');
    
    // Simular progresso (será substituído pelo progresso real durante a busca)
    progressInterval = setInterval(() => {
        if (currentProgress < 100) {
            currentProgress += Math.random() * 5;
            if (currentProgress > 100) currentProgress = 100;
            
            updateProgressBar(currentProgress);
            
            // Atualizar etapas baseado no progresso
            if (currentProgress >= 25 && currentStep < 2) {
                currentStep = 2;
                updateProgressStep(2, `Buscando preços para ${totalProducts} produtos...`);
            } else if (currentProgress >= 60 && currentStep < 3) {
                currentStep = 3;
                updateProgressStep(3, 'Processando e comparando dados...');
            } else if (currentProgress >= 90 && currentStep < 4) {
                currentStep = 4;
                updateProgressStep(4, 'Finalizando comparação...');
            }
        }
    }, 200);
}

/**
 * Atualiza a barra de progresso
 */
function updateProgressBar(percentage) {
    const progressBarFill = document.getElementById('progressBarFill');
    const progressPercentage = document.getElementById('progressPercentage');
    
    if (progressBarFill && progressPercentage) {
        progressBarFill.style.width = `${percentage}%`;
        progressPercentage.textContent = `${Math.round(percentage)}%`;
    }
}

/**
 * Atualiza a etapa atual do progresso
 */
function updateProgressStep(step, message) {
    // Atualizar todas as etapas
    document.querySelectorAll('.progress-step').forEach(stepElement => {
        const stepNumber = parseInt(stepElement.dataset.step);
        stepElement.classList.remove('active', 'completed');
        
        if (stepNumber < step) {
            stepElement.classList.add('completed');
        } else if (stepNumber === step) {
            stepElement.classList.add('active');
        }
    });
    
    // Atualizar texto de progresso
    const progressText = document.getElementById('progressText');
    const progressDetails = document.getElementById('progressDetails');
    
    if (progressText) {
        progressText.textContent = message;
    }
    
    if (progressDetails) {
        const details = {
            1: `Preparando para buscar ${currentBasketProducts.filter(p => p.codigo_barras).length} produtos em ${Array.from(selectedMarkets).length} mercados`,
            2: `Buscando preços por código de barras...`,
            3: `Processando resultados e calculando totais...`,
            4: `Gerando relatório de comparação...`
        };
        
        progressDetails.innerHTML = `<i class="fas fa-info-circle"></i><span>${details[step] || ''}</span>`;
    }
}

/**
 * Esconde a barra de progresso
 */
function hideProgressBar() {
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    const progressContainer = document.getElementById('progressContainer');
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }
}

/**
 * Busca preços por código de barras para todos os produtos da cesta
 */
async function searchBasketByBarcode(products, selectedMarkets) {
    const allResults = [];
    const totalProducts = products.length;
    
    // Atualizar para etapa de busca
    updateProgressStep(2, `Buscando preços para ${totalProducts} produtos...`);
    
    // Para cada produto na cesta, buscar por código de barras
    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        
        if (product.codigo_barras) {
            try {
                // Atualizar progresso detalhado
                const progress = 25 + (i / totalProducts) * 35; // 25% a 60%
                updateProgressBar(progress);
                
                const progressDetails = document.getElementById('progressDetails');
                if (progressDetails) {
                    progressDetails.innerHTML = `<i class="fas fa-info-circle"></i><span>Buscando: ${product.nome_produto} (${i + 1}/${totalProducts})</span>`;
                }
                
                const productResults = await fetchProductPrices(
                    product.codigo_barras, 
                    selectedMarkets
                );
                
                if (productResults && productResults.length > 0) {
                    // Adicionar informações do produto original
                    productResults.forEach(result => {
                        result.original_product_name = product.nome_produto;
                        result.original_barcode = product.codigo_barras;
                    });
                    
                    allResults.push(...productResults);
                }
            } catch (error) {
                console.error(`Erro ao buscar produto ${product.nome_produto}:`, error);
                // Continuar com os outros produtos mesmo se um falhar
            }
        }
    }
    
    // Atualizar para etapa de processamento
    updateProgressStep(3, 'Processando e comparando dados...');
    updateProgressBar(75);
    
    return allResults;
}

/**
 * Busca preços para um produto específico por código de barras
 */
async function fetchProductPrices(barcode, cnpjs) {
    try {
        const requestBody = { 
            produto: barcode, 
            cnpjs: cnpjs 
        };

        const response = await authenticatedFetch('/api/realtime-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erro na requisição');
        }

        const data = await response.json();
        const results = data.results || [];

        // Filtrar apenas resultados que correspondem exatamente ao código de barras
        const exactMatches = results.filter(item => 
            item.codigo_barras && item.codigo_barras.toString() === barcode.toString()
        );

        return exactMatches;
        
    } catch (error) {
        console.error(`Erro na busca por código de barras ${barcode}:`, error);
        return [];
    }
}

/**
 * Renderiza os resultados da comparação da cesta com NOVO LAYOUT DE CARDS
 */
function renderBasketComparison(results, selectedMarkets, productsWithBarcode) {
    // Finalizar barra de progresso
    updateProgressStep(4, 'Finalizando comparação...');
    updateProgressBar(95);
    
    setTimeout(() => {
        hideProgressBar();
        
        const resultsElement = document.getElementById('realtimeResults');
        
        if (results.length === 0) {
            resultsElement.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>Nenhum preço encontrado</h3>
                    <p>Não foram encontrados preços para os produtos da cesta (com código de barras) nos mercados selecionados.</p>
                    <p class="text-muted">Verifique se os códigos de barras estão corretos e se os mercados possuem estes produtos em estoque.</p>
                </div>
            `;
            return;
        }
        
        // ... (o restante da função renderBasketComparison permanece igual)
        // Agrupar resultados por mercado - CORREÇÃO: garantir agrupamento correto
        const resultsByMarket = {};
        const marketTotals = {};
        const productsFoundByMarket = {};
        const marketDetails = {};
        const marketProductDetails = {};
        
        // Inicializar estruturas
        selectedMarkets.forEach(cnpj => {
            const market = allMarkets.find(m => m.cnpj === cnpj);
            if (market) {
                resultsByMarket[market.nome] = [];
                marketTotals[market.nome] = 0;
                productsFoundByMarket[market.nome] = new Set();
                marketDetails[market.nome] = market;
                marketProductDetails[market.nome] = [];
            }
        });
        
        // Processar resultados - CORREÇÃO: garantir que cada produto seja contado apenas uma vez por mercado
        results.forEach(item => {
            const marketName = item.nome_supermercado;
            const price = parseFloat(item.preco_produto) || 0;
            const productKey = `${item.original_product_name}_${item.original_barcode}`;
            
            if (resultsByMarket[marketName]) {
                // Verificar se este produto já foi contabilizado para este mercado
                if (!productsFoundByMarket[marketName].has(productKey)) {
                    resultsByMarket[marketName].push(item);
                    marketTotals[marketName] += price;
                    productsFoundByMarket[marketName].add(productKey);
                    marketProductDetails[marketName].push({
                        ...item,
                        price: price
                    });
                }
            }
        });
        
        // Calcular melhor cesta básica (produtos mais baratos de todos os mercados)
        const bestBasket = calculateBestBasket(results, productsWithBarcode);
        
        // Encontrar supermercado com cesta completa mais barata
        const completeBasketMarket = findCompleteBasketMarket(marketTotals, productsFoundByMarket, productsWithBarcode);
        
        // Ordenar mercados por preço total
        const sortedMarkets = Object.entries(marketTotals)
            .sort(([, a], [, b]) => a - b)
            .filter(([, total]) => total > 0);
        
        // 1. Card da Melhor Cesta Básica
        let bestBasketHtml = '';
        if (bestBasket.products.length > 0) {
            bestBasketHtml = `
                <div class="results-section">
                    <h3><i class="fas fa-crown text-warning"></i> Melhor Cesta Básica</h3>
                    <div class="cards-grid">
                        <div class="market-card best-basket">
                            <div class="card-header">
                                <div class="market-rank best">#1</div>
                                <div class="market-name">Cesta Otimizada</div>
                                <div class="market-badge best-price">
                                    <i class="fas fa-trophy"></i> Melhor Preço
                                </div>
                            </div>
                            <div class="card-body">
                                <div class="market-total">
                                    R$ ${bestBasket.total.toFixed(2)}
                                    <div class="total-label">Valor Total</div>
                                </div>
                                <div class="market-stats">
                                    <div class="stat">
                                        <span class="stat-value">${bestBasket.products.length}</span>
                                        <span class="stat-label">Produtos Encontrados</span>
                                    </div>
                                    <div class="stat">
                                        <span class="stat-value">${productsWithBarcode.length}</span>
                                        <span class="stat-label">Total na Cesta</span>
                                    </div>
                                </div>
                                <div class="completion-rate">
                                    <div class="progress">
                                        <div class="progress-bar" style="width: ${(bestBasket.products.length / productsWithBarcode.length) * 100}%"></div>
                                    </div>
                                    <span>${Math.round((bestBasket.products.length / productsWithBarcode.length) * 100)}% de cobertura</span>
                                </div>
                            </div>
                            <div class="card-footer">
                                <button class="btn btn-outline btn-view-best-basket">
                                    <i class="fas fa-list"></i> Ver Detalhes da Cesta
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 2. Card do Supermercado com Cesta Completa Mais Barata
        let completeBasketHtml = '';
        if (completeBasketMarket) {
            const marketName = completeBasketMarket.name;
            const total = completeBasketMarket.total;
            const productCount = completeBasketMarket.productCount;
            const market = marketDetails[marketName];
            
            completeBasketHtml = `
                <div class="results-section">
                    <h3><i class="fas fa-award text-success"></i> Supermercado com Cesta Completa Mais Barata</h3>
                    <div class="cards-grid">
                        <div class="market-card complete-basket">
                            <div class="card-header">
                                <div class="market-rank best">#1 Completo</div>
                                <div class="market-name">${marketName}</div>
                                <div class="market-badge complete">
                                    <i class="fas fa-check-circle"></i> Cesta Completa
                                </div>
                            </div>
                            <div class="card-body">
                                <div class="market-address">
                                    <i class="fas fa-map-marker-alt"></i>
                                    ${market.endereco || 'Endereço não disponível'}
                                </div>
                                <div class="market-total">
                                    R$ ${total.toFixed(2)}
                                    <div class="total-label">Valor Total</div>
                                </div>
                                <div class="market-stats">
                                    <div class="stat">
                                        <span class="stat-value">${productCount}</span>
                                        <span class="stat-label">Produtos Encontrados</span>
                                    </div>
                                    <div class="stat">
                                        <span class="stat-value">${productsWithBarcode.length}</span>
                                        <span class="stat-label">Total na Cesta</span>
                                    </div>
                                </div>
                                <div class="completion-rate">
                                    <div class="progress">
                                        <div class="progress-bar" style="width: 100%"></div>
                                    </div>
                                    <span>100% de cobertura</span>
                                </div>
                            </div>
                            <div class="card-footer">
                                <button class="btn btn-outline btn-view-details" data-market="${marketName}">
                                    <i class="fas fa-list"></i> Ver Detalhes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 3. Cards dos Mercados (Top 1, Mais Caro e Outros)
        let marketsHtml = `
            <div class="results-section">
                <h3><i class="fas fa-store"></i> Comparação por Mercado</h3>
                <div class="cards-grid">
        `;
        
        sortedMarkets.forEach(([marketName, total], index) => {
            // CORREÇÃO: usar o Set para obter a contagem correta de produtos únicos
            const productCount = productsFoundByMarket[marketName].size;
            const completionRate = Math.round((productCount / productsWithBarcode.length) * 100);
            const market = marketDetails[marketName];
            const isCheapest = index === 0;
            const isMostExpensive = index === sortedMarkets.length - 1;
            
            // Pular se for o mercado da cesta completa (já mostrado acima)
            if (completeBasketMarket && marketName === completeBasketMarket.name) {
                return;
            }
            
            let cardClass = 'market-card';
            let rankClass = '';
            let rankText = '';
            
            if (isCheapest) {
                cardClass += ' cheapest';
                rankClass = 'best';
                rankText = '#1 Mais Barato';
            } else if (isMostExpensive) {
                cardClass += ' most-expensive';
                rankClass = 'worst';
                rankText = `#${sortedMarkets.length} Mais Caro`;
            } else {
                rankText = `#${index + 1}`;
            }
            
            marketsHtml += `
                <div class="${cardClass}">
                    <div class="card-header">
                        <div class="market-rank ${rankClass}">${rankText}</div>
                        <div class="market-name">${marketName}</div>
                        ${isCheapest ? '<div class="market-badge best-price"><i class="fas fa-trophy"></i> Melhor Preço</div>' : ''}
                    </div>
                    <div class="card-body">
                        <div class="market-address">
                            <i class="fas fa-map-marker-alt"></i>
                            ${market.endereco || 'Endereço não disponível'}
                        </div>
                        <div class="market-total">
                            R$ ${total.toFixed(2)}
                            <div class="total-label">Valor Total</div>
                        </div>
                        <div class="market-stats">
                            <div class="stat">
                                <span class="stat-value">${productCount}</span>
                                <span class="stat-label">Produtos Encontrados</span>
                            </div>
                            <div class="stat">
                                <span class="stat-value">${productsWithBarcode.length}</span>
                                <span class="stat-label">Total na Cesta</span>
                            </div>
                        </div>
                        <div class="completion-rate">
                            <div class="progress">
                                <div class="progress-bar" style="width: ${completionRate}%"></div>
                            </div>
                            <span>${completionRate}% de cobertura</span>
                        </div>
                    </div>
                    <div class="card-footer">
                        <button class="btn btn-outline btn-view-details" data-market="${marketName}">
                            <i class="fas fa-list"></i> Ver Detalhes
                        </button>
                    </div>
                </div>
            `;
        });
        
        marketsHtml += `</div></div>`;
        
        // 4. Resumo Estatístico
        const summaryHtml = `
            <div class="results-summary">
                <div class="summary-stats">
                    <div class="stat">
                        <span class="stat-value">${results.length}</span>
                        <span class="stat-label">Preços Encontrados</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${Object.keys(resultsByMarket).length}</span>
                        <span class="stat-label">Mercados com Preços</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${productsWithBarcode.length}</span>
                        <span class="stat-label">Produtos com Código</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${selectedMarkets.length}</span>
                        <span class="stat-label">Mercados Selecionados</span>
                    </div>
                </div>
            </div>
        `;
        
        resultsElement.innerHTML = summaryHtml + bestBasketHtml + completeBasketHtml + marketsHtml;
        
        // Adicionar event listeners para os botões de detalhes
        resultsElement.querySelectorAll('.btn-view-details').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const marketName = e.target.closest('button').dataset.market;
                showMarketDetails(marketName, marketProductDetails[marketName], marketDetails[marketName], productsWithBarcode);
            });
        });
        
        // Adicionar event listener para o botão da melhor cesta
        resultsElement.querySelectorAll('.btn-view-best-basket').forEach(btn => {
            btn.addEventListener('click', () => {
                showBestBasketDetails(bestBasket, productsWithBarcode);
            });
        });
        
    }, 500); // Pequeno delay para mostrar o 100% antes de esconder
}

// ... (o restante das funções permanece igual - findCompleteBasketMarket, calculateBestBasket, showMarketDetails, showBestBasketDetails, createBestBasketModal, debounce)

/**
 * Encontra o supermercado com cesta completa mais barata (que tenha todos os produtos)
 */
function findCompleteBasketMarket(marketTotals, productsFoundByMarket, productsWithBarcode) {
    let completeMarket = null;
    let lowestTotal = Infinity;
    
    // Procurar por mercados que tenham todos os produtos
    Object.entries(marketTotals).forEach(([marketName, total]) => {
        const productCount = productsFoundByMarket[marketName].size;
        
        // Verificar se este mercado tem todos os produtos
        if (productCount === productsWithBarcode.length) {
            if (total < lowestTotal) {
                lowestTotal = total;
                completeMarket = {
                    name: marketName,
                    total: total,
                    productCount: productCount
                };
            }
        }
    });
    
    return completeMarket;
}

/**
 * Calcula a melhor cesta básica (produtos mais baratos de todos os mercados)
 */
function calculateBestBasket(results, productsWithBarcode) {
    const bestProducts = {};
    
    // Para cada produto, encontrar o menor preço em qualquer mercado
    productsWithBarcode.forEach(product => {
        const productResults = results.filter(r => 
            r.original_product_name === product.nome_produto && 
            r.original_barcode === product.codigo_barras
        );
        
        if (productResults.length > 0) {
            const bestOffer = productResults.reduce((best, current) => {
                const currentPrice = parseFloat(current.preco_produto) || 0;
                const bestPrice = parseFloat(best.preco_produto) || 0;
                return currentPrice < bestPrice ? current : best;
            });
            
            bestProducts[product.nome_produto] = {
                ...bestOffer,
                price: parseFloat(bestOffer.preco_produto) || 0
            };
        }
    });
    
    const bestProductsArray = Object.values(bestProducts);
    const total = bestProductsArray.reduce((sum, product) => sum + product.price, 0);
    
    return {
        products: bestProductsArray,
        total: total
    };
}

/**
 * Mostra detalhes de um mercado específico - VERSÃO CORRIGIDA
 */
function showMarketDetails(marketName, products, marketInfo, allProducts) {
    const content = document.getElementById('marketDetailsContent');
    
    // CORREÇÃO: calcular o total corretamente a partir dos produtos
    const total = products.reduce((sum, product) => sum + (product.price || 0), 0);
    const productCount = products.length;
    const totalProducts = allProducts.length;
    
    let detailsHtml = `
        <div class="market-details-header">
            <h4><i class="fas fa-store"></i> ${marketName}</h4>
            ${marketInfo.endereco ? `<p class="market-address"><i class="fas fa-map-marker-alt"></i> ${marketInfo.endereco}</p>` : ''}
            
            <div class="market-stats-grid">
                <div class="market-stat">
                    <div class="stat-value">${productCount}</div>
                    <div class="stat-label">Produtos Encontrados</div>
                </div>
                <div class="market-stat">
                    <div class="stat-value">${totalProducts}</div>
                    <div class="stat-label">Total na Cesta</div>
                </div>
                <div class="market-stat">
                    <div class="stat-value">R$ ${total.toFixed(2)}</div>
                    <div class="stat-label">Valor Total</div>
                </div>
            </div>
        </div>
        
        <div class="products-list">
            <h5>Produtos Encontrados (${productCount} de ${totalProducts}):</h5>
            <table class="table">
                <thead>
                    <tr>
                        <th>Produto</th>
                        <th>Preço (R$)</th>
                        <th>Unidade</th>
                        <th>Última Venda</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Ordenar produtos por nome
    products.sort((a, b) => a.original_product_name.localeCompare(b.original_product_name));
    
    products.forEach(product => {
        const lastSaleDate = product.data_ultima_venda ? 
            new Date(product.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
            
        detailsHtml += `
            <tr>
                <td>
                    <div class="product-name">${product.original_product_name}</div>
                    ${product.nome_produto !== product.original_product_name ? 
                      `<div class="product-alias">(${product.nome_produto})</div>` : ''}
                </td>
                <td class="price">R$ ${(product.price || 0).toFixed(2)}</td>
                <td>${product.unidade || 'UN'}</td>
                <td>${lastSaleDate}</td>
            </tr>
        `;
    });
    
    // Mostrar produtos não encontrados
    const foundProductNames = products.map(p => p.original_product_name);
    const missingProducts = allProducts.filter(p => !foundProductNames.includes(p.nome_produto));
    
    if (missingProducts.length > 0) {
        detailsHtml += `
            <tr class="section-divider">
                <td colspan="4">
                    <strong>Produtos Não Encontrados neste Mercado:</strong>
                </td>
            </tr>
        `;
        
        missingProducts.forEach(product => {
            detailsHtml += `
                <tr class="text-muted">
                    <td>${product.nome_produto}</td>
                    <td colspan="3" class="text-center">Produto não encontrado</td>
                </tr>
            `;
        });
    }
    
    detailsHtml += `</tbody></table></div>`;
    content.innerHTML = detailsHtml;
    marketDetailsModal.style.display = 'block';
}

/**
 * Mostra detalhes da melhor cesta básica
 */
function showBestBasketDetails(bestBasket, originalProducts) {
    const content = document.getElementById('bestBasketContent');
    
    let detailsHtml = `
        <div class="market-details-header">
            <h4><i class="fas fa-crown text-warning"></i> Melhor Cesta Básica</h4>
            <p class="market-address"><i class="fas fa-lightbulb"></i> Combinação dos produtos mais baratos de todos os mercados</p>
            
            <div class="market-stats-grid">
                <div class="market-stat">
                    <div class="stat-value">${bestBasket.products.length}</div>
                    <div class="stat-label">Produtos Otimizados</div>
                </div>
                <div class="market-stat">
                    <div class="stat-value">R$ ${bestBasket.total.toFixed(2)}</div>
                    <div class="stat-label">Valor Total</div>
                </div>
                <div class="market-stat">
                    <div class="stat-value">${originalProducts.length}</div>
                    <div class="stat-label">Total na Cesta</div>
                </div>
            </div>
        </div>
        
        <div class="products-list">
            <h5>Produtos da Cesta Otimizada:</h5>
            <table class="table">
                <thead>
                    <tr>
                        <th>Produto</th>
                        <th>Melhor Preço (R$)</th>
                        <th>Mercado</th>
                        <th>Endereço</th>
                        <th>Última Venda</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Ordenar produtos por nome
    bestBasket.products.sort((a, b) => a.original_product_name.localeCompare(b.original_product_name));
    
    bestBasket.products.forEach(product => {
        const lastSaleDate = product.data_ultima_venda ? 
            new Date(product.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
        const market = allMarkets.find(m => m.nome === product.nome_supermercado);
        const marketAddress = market ? market.endereco : 'N/A';
            
        detailsHtml += `
            <tr>
                <td>
                    <div class="product-name">${product.original_product_name}</div>
                    ${product.nome_produto !== product.original_product_name ? 
                      `<div class="product-alias">(${product.nome_produto})</div>` : ''}
                </td>
                <td class="price price-cheapest">R$ ${(product.price || 0).toFixed(2)}</td>
                <td><strong>${product.nome_supermercado}</strong></td>
                <td>${marketAddress}</td>
                <td>${lastSaleDate}</td>
            </tr>
        `;
    });
    
    // Adicionar produtos não encontrados
    const foundProductNames = bestBasket.products.map(p => p.original_product_name);
    const missingProducts = originalProducts.filter(p => !foundProductNames.includes(p.nome_produto));
    
    if (missingProducts.length > 0) {
        detailsHtml += `
            <tr class="section-divider">
                <td colspan="5">
                    <strong>Produtos Não Encontrados em Nenhum Mercado:</strong>
                </td>
            </tr>
        `;
        
        missingProducts.forEach(product => {
            detailsHtml += `
                <tr class="text-muted">
                    <td>${product.nome_produto}</td>
                    <td colspan="4" class="text-center">Nenhum preço encontrado</td>
                </tr>
            `;
        });
    }
    
    detailsHtml += `</tbody></table></div>`;
    
    // Criar modal da melhor cesta se não existir
    if (!document.getElementById('bestBasketModal')) {
        createBestBasketModal();
    }
    
    document.getElementById('bestBasketContent').innerHTML = detailsHtml;
    document.getElementById('bestBasketModal').style.display = 'block';
}

/**
 * Cria o modal da melhor cesta básica
 */
function createBestBasketModal() {
    const modalHtml = `
        <div id="bestBasketModal" class="modal">
            <div class="modal-content" style="max-width: 1200px;">
                <div class="modal-header">
                    <h5>Detalhes da Melhor Cesta Básica</h5>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <div id="bestBasketContent">
                        <!-- Conteúdo será renderizado aqui -->
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Adicionar event listener para fechar
    document.getElementById('bestBasketModal').querySelector('.close').addEventListener('click', function() {
        document.getElementById('bestBasketModal').style.display = 'none';
    });
}

/**
 * Função utilitária para debounce
 */
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
