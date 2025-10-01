document.addEventListener('DOMContentLoaded', () => {
    // Elementos principais
    const barcodesInput = document.getElementById('barcodesInput');
    const supermarketGrid = document.getElementById('supermarketGrid');
    const compareButton = document.getElementById('compareButton');
    const chartCanvas = document.getElementById('priceChart');
    const chartContainer = document.getElementById('chartContainer');
    const infographicContainer = document.getElementById('infographicContainer');
    const dataTableContainer = document.getElementById('dataTableContainer');
    const loadingContainer = document.getElementById('loadingContainer');
    
    // Elementos do infográfico
    const totalProducts = document.getElementById('totalProducts');
    const totalMarkets = document.getElementById('totalMarkets');
    const analysisPeriod = document.getElementById('analysisPeriod');
    const maxVariation = document.getElementById('maxVariation');
    const bestPricesList = document.getElementById('bestPricesList');
    const trendsList = document.getElementById('trendsList');
    const alertsList = document.getElementById('alertsList');
    const dataTableBody = document.querySelector('#dataTable tbody');

    // Controles de mercado
    const marketSearch = document.getElementById('marketSearch');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarkets = document.getElementById('selectAllMarkets');
    const deselectAllMarkets = document.getElementById('deselectAllMarkets');
    const selectedCount = document.getElementById('selectedCount');

    let priceChart = null;
    let allMarkets = [];
    let filteredMarkets = [];
    let selectedMarkets = new Set();
    let comparisonData = [];

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
        compareButton.addEventListener('click', comparePrices);
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

    async function comparePrices() {
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
        
        loadingContainer.style.display = 'flex';
        chartContainer.style.display = 'none';
        infographicContainer.style.display = 'none';
        dataTableContainer.style.display = 'none';

        try {
            const session = await getSession();
            if (!session) {
                showNotification('Você precisa estar logado', 'error');
                return;
            }

            // Buscar dados para todos os códigos e mercados
            comparisonData = [];
            
            for (const barcode of barcodes) {
                const productData = await fetchProductData(barcode, selectedCnpjs, session);
                if (productData) {
                    comparisonData.push(productData);
                }
            }

            if (comparisonData.length === 0) {
                showNotification('Nenhum dado encontrado para os critérios informados', 'warning');
                return;
            }

            renderChart();
            renderInfographic();
            renderDataTable();
            
            chartContainer.style.display = 'block';
            infographicContainer.style.display = 'block';
            dataTableContainer.style.display = 'block';
            
        } catch (error) {
            console.error('Erro na comparação:', error);
            showNotification('Erro ao buscar dados de comparação', 'error');
        } finally {
            loadingContainer.style.display = 'none';
        }
    }

    async function fetchProductData(barcode, cnpjs, session) {
        try {
            // Buscar dados históricos do produto
            const response = await fetch(`/api/price-history`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ 
                    product_identifier: barcode, 
                    cnpjs: cnpjs,
                    start_date: getDefaultStartDate(),
                    end_date: new Date().toISOString().split('T')[0]
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro na requisição');
            }
            
            const historyData = await response.json();
            
            // Buscar informações do produto
            const productInfo = await fetchProductInfo(barcode, session);
            
            return {
                barcode,
                productInfo,
                history: historyData,
                markets: cnpjs,
                analysis: analyzeProductData(historyData, productInfo)
            };
            
        } catch (error) {
            console.error(`Erro ao buscar dados para ${barcode}:`, error);
            return null;
        }
    }

    async function fetchProductInfo(barcode, session) {
        try {
            const response = await fetch(`/api/product-info/${barcode}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });
            
            if (response.ok) {
                return await response.json();
            }
            return { nome: `Produto ${barcode}`, marca: '', categoria: '' };
        } catch (error) {
            return { nome: `Produto ${barcode}`, marca: '', categoria: '' };
        }
    }

    function analyzeProductData(historyData, productInfo) {
        const analysis = {
            currentPrices: {},
            priceChanges: {},
            bestPrice: { value: Infinity, market: '' },
            worstPrice: { value: 0, market: '' },
            trends: {},
            alerts: []
        };

        // Analisar dados de cada mercado
        Object.entries(historyData).forEach(([market, dataPoints]) => {
            if (dataPoints.length > 0) {
                const latestPrice = dataPoints[dataPoints.length - 1].y;
                const oldestPrice = dataPoints[0].y;
                
                analysis.currentPrices[market] = latestPrice;
                analysis.priceChanges[market] = ((latestPrice - oldestPrice) / oldestPrice) * 100;
                
                // Melhor preço
                if (latestPrice < analysis.bestPrice.value) {
                    analysis.bestPrice = { value: latestPrice, market };
                }
                
                // Pior preço
                if (latestPrice > analysis.worstPrice.value) {
                    analysis.worstPrice = { value: latestPrice, market };
                }
                
                // Tendência (últimos 7 dias)
                if (dataPoints.length >= 7) {
                    const recentPoints = dataPoints.slice(-7);
                    const trend = calculateTrend(recentPoints);
                    analysis.trends[market] = trend;
                }
            }
        });

        // Gerar alertas
        if (analysis.bestPrice.value > 0 && analysis.worstPrice.value > 0) {
            const priceDifference = ((analysis.worstPrice.value - analysis.bestPrice.value) / analysis.bestPrice.value) * 100;
            
            if (priceDifference > 50) {
                analysis.alerts.push(`Diferença de preço extrema: ${priceDifference.toFixed(1)}% entre mercados`);
            }
            
            if (Object.values(analysis.priceChanges).some(change => change > 20)) {
                analysis.alerts.push('Aumentos significativos de preço detectados');
            }
        }

        return analysis;
    }

    function calculateTrend(dataPoints) {
        if (dataPoints.length < 2) return 'estável';
        
        const firstPrice = dataPoints[0].y;
        const lastPrice = dataPoints[dataPoints.length - 1].y;
        const change = ((lastPrice - firstPrice) / firstPrice) * 100;
        
        if (change > 5) return 'alta';
        if (change < -5) return 'baixa';
        return 'estável';
    }

    function renderChart() {
        if (priceChart) {
            priceChart.destroy();
        }

        const ctx = chartCanvas.getContext('2d');
        const datasets = [];

        // Cores para os mercados
        const marketColors = generateColors(selectedMarkets.size);
        const marketColorMap = {};
        Array.from(selectedMarkets).forEach((cnpj, index) => {
            const market = allMarkets.find(m => m.cnpj === cnpj);
            marketColorMap[cnpj] = {
                color: marketColors[index],
                name: market ? market.nome : cnpj
            };
        });

        // Criar datasets para cada produto em cada mercado
        comparisonData.forEach((productData, productIndex) => {
            Object.entries(productData.history).forEach(([marketCnpj, dataPoints]) => {
                if (selectedMarkets.has(marketCnpj) && dataPoints.length > 0) {
                    const marketInfo = marketColorMap[marketCnpj];
                    datasets.push({
                        label: `${productData.productInfo.nome} - ${marketInfo.name}`,
                        data: dataPoints,
                        borderColor: marketInfo.color,
                        backgroundColor: marketInfo.color + '20',
                        borderWidth: 2,
                        tension: 0.1,
                        fill: false
                    });
                }
            });
        });

        priceChart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Evolução de Preços por Produto e Mercado'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: R$ ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'dd/MM/yyyy'
                        },
                        title: {
                            display: true,
                            text: 'Data'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Preço (R$)'
                        },
                        ticks: {
                            callback: (value) => 'R$ ' + value.toFixed(2)
                        }
                    }
                }
            }
        });
    }

    function renderInfographic() {
        // Estatísticas gerais
        totalProducts.textContent = comparisonData.length;
        totalMarkets.textContent = selectedMarkets.size;
        
        // Período de análise
        const dates = getAllDates();
        if (dates.length > 0) {
            const startDate = new Date(Math.min(...dates));
            const endDate = new Date(Math.max(...dates));
            analysisPeriod.textContent = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
        }
        
        // Maior variação
        const maxVar = findMaxVariation();
        maxVariation.textContent = maxVar ? `${maxVar.variation.toFixed(1)}%` : '-';

        // Melhores preços
        renderBestPrices();
        
        // Tendências
        renderTrends();
        
        // Alertas
        renderAlerts();
    }

    function getAllDates() {
        const allDates = [];
        comparisonData.forEach(product => {
            Object.values(product.history).forEach(dataPoints => {
                dataPoints.forEach(point => {
                    allDates.push(new Date(point.x).getTime());
                });
            });
        });
        return allDates;
    }

    function findMaxVariation() {
        let maxVariation = null;
        
        comparisonData.forEach(product => {
            Object.entries(product.analysis.priceChanges).forEach(([market, change]) => {
                if (!maxVariation || Math.abs(change) > Math.abs(maxVariation.variation)) {
                    maxVariation = {
                        product: product.productInfo.nome,
                        market: allMarkets.find(m => m.cnpj === market)?.nome || market,
                        variation: change
                    };
                }
            });
        });
        
        return maxVariation;
    }

    function renderBestPrices() {
        bestPricesList.innerHTML = '';
        
        comparisonData.forEach(product => {
            const best = product.analysis.bestPrice;
            if (best.market && best.value < Infinity) {
                const marketName = allMarkets.find(m => m.cnpj === best.market)?.nome || best.market;
                const priceItem = document.createElement('div');
                priceItem.className = 'price-item';
                priceItem.innerHTML = `
                    <strong>${product.productInfo.nome}</strong>
                    <span>R$ ${best.value.toFixed(2)}</span>
                    <small>${marketName}</small>
                `;
                bestPricesList.appendChild(priceItem);
            }
        });
    }

    function renderTrends() {
        trendsList.innerHTML = '';
        
        const trendSummary = { alta: 0, baixa: 0, estável: 0 };
        
        comparisonData.forEach(product => {
            Object.values(product.analysis.trends).forEach(trend => {
                trendSummary[trend]++;
            });
        });
        
        Object.entries(trendSummary).forEach(([trend, count]) => {
            if (count > 0) {
                const trendItem = document.createElement('div');
                trendItem.className = `trend-item trend-${trend}`;
                trendItem.innerHTML = `
                    <i class="fas fa-${getTrendIcon(trend)}"></i>
                    <span>${count} ${trend}</span>
                `;
                trendsList.appendChild(trendItem);
            }
        });
    }

    function renderAlerts() {
        alertsList.innerHTML = '';
        
        const allAlerts = new Set();
        comparisonData.forEach(product => {
            product.analysis.alerts.forEach(alert => allAlerts.add(alert));
        });
        
        if (allAlerts.size === 0) {
            alertsList.innerHTML = '<div class="alert-item no-alerts">Nenhum alerta crítico</div>';
            return;
        }
        
        Array.from(allAlerts).forEach(alert => {
            const alertItem = document.createElement('div');
            alertItem.className = 'alert-item';
            alertItem.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span>${alert}</span>
            `;
            alertsList.appendChild(alertItem);
        });
    }

    function renderDataTable() {
        dataTableBody.innerHTML = '';
        
        comparisonData.forEach(product => {
            Object.entries(product.analysis.currentPrices).forEach(([marketCnpj, price]) => {
                const market = allMarkets.find(m => m.cnpj === marketCnpj);
                const change = product.analysis.priceChanges[marketCnpj] || 0;
                const trend = product.analysis.trends[marketCnpj] || 'estável';
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${product.productInfo.nome}</td>
                    <td>${product.barcode}</td>
                    <td>${market ? market.nome : marketCnpj}</td>
                    <td>R$ ${price.toFixed(2)}</td>
                    <td class="change-${change >= 0 ? 'positive' : 'negative'}">
                        ${change >= 0 ? '+' : ''}${change.toFixed(1)}%
                    </td>
                    <td>${getLatestDate(product.history[marketCnpj])}</td>
                `;
                dataTableBody.appendChild(row);
            });
        });
    }

    // Funções utilitárias
    function getDefaultStartDate() {
        const date = new Date();
        date.setDate(date.getDate() - 30); // Últimos 30 dias
        return date.toISOString().split('T')[0];
    }

    function getLatestDate(dataPoints) {
        if (!dataPoints || dataPoints.length === 0) return '-';
        const latestDate = new Date(Math.max(...dataPoints.map(p => new Date(p.x).getTime())));
        return latestDate.toLocaleDateString();
    }

    function getTrendIcon(trend) {
        switch (trend) {
            case 'alta': return 'arrow-up';
            case 'baixa': return 'arrow-down';
            default: return 'minus';
        }
    }

    function generateColors(count) {
        const colors = [];
        const hueStep = 360 / count;
        
        for (let i = 0; i < count; i++) {
            const hue = (i * hueStep) % 360;
            colors.push(`hsl(${hue}, 70%, 50%)`);
        }
        
        return colors;
    }

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
        // Implementação da função de notificação (similar à do admin.js)
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
