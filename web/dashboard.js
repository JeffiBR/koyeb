// dashboard.js - Versão modularizada e melhorada

class Dashboard {
    constructor() {
        this.dataService = new DashboardData();
        this.ui = new DashboardUI();
        this.charts = new Map();
        this.components = new Map();
        this.filters = {
            dateRange: '30',
            startDate: '',
            endDate: '',
            market: 'all'
        };
        
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando Dashboard...');
        
        try {
            await this.initializeComponents();
            this.setupEventListeners();
            await this.loadInitialData();
            this.setupRealTimeUpdates();
            
            console.log('✅ Dashboard inicializado com sucesso');
        } catch (error) {
            console.error('❌ Erro na inicialização do dashboard:', error);
            this.ui.showNotification('Erro ao inicializar o dashboard', 'error');
        }
    }

    async initializeComponents() {
        // Inicializar componentes de UI
        await this.initializeMetrics();
        await this.initializeMarketSelector();
        await this.initializeBarcodeInput();
        await this.initializeCharts();
    }

    async initializeMetrics() {
        const metricsContainer = document.querySelector('.metrics-grid');
        if (!metricsContainer) return;

        const metricsConfig = [
            {
                id: 'totalMarkets',
                title: 'Mercados Cadastrados',
                icon: 'fas fa-store',
                iconType: 'primary',
                format: 'integer'
            },
            {
                id: 'totalProducts',
                title: 'Produtos na Base',
                icon: 'fas fa-shopping-basket',
                iconType: 'success',
                format: 'integer'
            },
            {
                id: 'totalCollections',
                title: 'Coletas Realizadas',
                icon: 'fas fa-database',
                iconType: 'warning',
                format: 'integer'
            },
            {
                id: 'lastCollection',
                title: 'Última Coleta',
                icon: 'fas fa-clock',
                iconType: 'info',
                format: 'datetime',
                onUpdate: (element, info) => {
                    const badge = element.querySelector('.metric-badge');
                    if (badge && info.status) {
                        badge.className = `metric-badge status-${info.status}`;
                        badge.textContent = info.status === 'recent' ? 'AGORA' : 'HOJE';
                    }
                }
            }
        ];

        metricsConfig.forEach(config => {
            const metric = this.ui.createMetricCard(config.id, config);
            metric.render(metricsContainer);
            this.components.set(config.id, metric);
        });
    }

    async initializeMarketSelector() {
        const selectorContainer = document.getElementById('marketSelectorContainer');
        if (!selectorContainer) return;

        const marketSelector = this.ui.createMarketSelector({
            title: 'Selecionar Mercados para Análise',
            onChange: (selectedMarkets) => {
                this.filters.market = selectedMarkets.length > 0 ? selectedMarkets.join(',') : 'all';
                this.loadDashboardData();
            }
        });

        marketSelector.render(selectorContainer);
        this.components.set('marketSelector', marketSelector);

        // Carregar mercados
        try {
            const markets = await this.dataService.getMarkets();
            marketSelector.loadMarkets(markets);
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
        }
    }

    async initializeBarcodeInput() {
        const barcodeContainer = document.getElementById('barcodeInputContainer');
        if (!barcodeContainer) return;

        const barcodeInput = this.ui.createBarcodeInput({
            title: 'Análise por Código de Barras',
            maxItems: 5,
            onProductSearch: async (barcode) => {
                try {
                    return await this.dataService.getProductInfo(barcode);
                } catch (error) {
                    return null;
                }
            },
            onShowProductSearch: (index) => {
                this.showProductSearchModal(index);
            },
            onBarcodeScan: () => {
                this.startBarcodeScan();
            }
        });

        barcodeInput.render(barcodeContainer);
        this.components.set('barcodeInput', barcodeInput);
    }

    async initializeCharts() {
        // Gráfico de tendência de preços
        const priceTrendChart = this.ui.createChart({
            id: 'priceTrendChart',
            title: 'Tendência de Preços',
            type: 'line',
            size: 'large',
            onRefresh: () => this.loadPriceTrends(),
            onZoom: (chart) => this.zoomChart(chart)
        });

        priceTrendChart.render(document.getElementById('priceTrendChartContainer'));
        this.charts.set('priceTrend', priceTrendChart);

        // Adicionar mais gráficos conforme necessário...
    }

    async loadInitialData() {
        this.updateDateRange();
        await this.loadDashboardData();
        await this.loadAvailableDates();
    }

    async loadDashboardData() {
        this.ui.showNotification('Carregando dados...', 'info', 2000);
        
        try {
            const [summary, trends, topProducts, categories, bargains, comparison, activity] = await Promise.all([
                this.dataService.getDashboardSummary(this.filters.startDate, this.filters.endDate, this.filters.market),
                this.dataService.getPriceTrends(this.filters.startDate, this.filters.endDate, this.filters.market),
                this.dataService.getTopProducts(this.filters.startDate, this.filters.endDate, this.filters.market),
                this.dataService.getCategoryStats(this.filters.startDate, this.filters.endDate, this.filters.market),
                this.dataService.getBargains(this.filters.startDate, this.filters.endDate, this.filters.market),
                this.dataService.getMarketComparison(this.filters.startDate, this.filters.endDate, this.filters.market),
                this.dataService.getRecentActivity()
            ]);

            this.updateMetrics(summary);
            this.updateCharts({ trends, topProducts, categories, comparison });
            this.updateBargains(bargains);
            this.updateActivity(activity);

            this.ui.showNotification('Dados atualizados com sucesso', 'success', 3000);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            this.ui.showNotification('Erro ao carregar dados do dashboard', 'error');
        }
    }

    updateMetrics(summary) {
        // Atualizar métricas
        this.components.get('totalMarkets')?.update(summary.total_mercados || 0);
        this.components.get('totalProducts')?.update(summary.total_produtos || 0);
        this.components.get('totalCollections')?.update(summary.total_coletas || 0);
        
        // Última coleta
        const lastCollection = this.components.get('lastCollection');
        if (lastCollection && summary.ultima_coleta) {
            const lastDate = new Date(summary.ultima_coleta);
            const now = new Date();
            const diffHours = (now - lastDate) / (1000 * 60 * 60);
            
            let status = 'old';
            if (diffHours < 1) status = 'recent';
            else if (diffHours < 24) status = 'today';
            
            lastCollection.update(
                lastDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                null,
                { status }
            );
        }
    }

    updateCharts(data) {
        // Atualizar gráfico de tendências
        const trendChart = this.charts.get('priceTrend');
        if (trendChart && data.trends) {
            trendChart.updateData({
                labels: data.trends.map(t => new Date(t.data).toLocaleDateString('pt-BR')),
                datasets: [{
                    label: 'Preço Médio',
                    data: data.trends.map(t => t.preco_medio),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    format: 'currency'
                }]
            });
        }
        
        // Atualizar outros gráficos...
    }

    updateBargains(bargains) {
        const bargainsList = document.getElementById('bargainsList');
        if (!bargainsList) return;

        if (!bargains || bargains.length === 0) {
            bargainsList.innerHTML = '<div class="no-data">Nenhuma oferta encontrada</div>';
            return;
        }

        bargainsList.innerHTML = bargains.map(bargain => `
            <div class="bargain-item">
                <div class="bargain-icon">
                    <i class="fas fa-percentage"></i>
                </div>
                <div class="bargain-info">
                    <div class="bargain-product">${bargain.nome_produto}</div>
                    <div class="bargain-market">${bargain.nome_supermercado}</div>
                    <div class="bargain-meta">
                        <span class="bargain-unit">${bargain.tipo_unidade}</span>
                        ${bargain.codigo_barras ? `<span class="bargain-barcode">${bargain.codigo_barras}</span>` : ''}
                    </div>
                </div>
                <div class="bargain-price">
                    <div class="bargain-amount">R$ ${bargain.preco_produto.toFixed(2)}</div>
                    <div class="bargain-savings">
                        <i class="fas fa-chart-line"></i>
                        Economia: ${bargain.economia_percentual.toFixed(1)}%
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateActivity(activity) {
        const tableBody = document.querySelector('#recentActivityTable tbody');
        if (!tableBody) return;

        const activities = activity.ultimas_coletas || [];
        
        if (activities.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="no-data">Nenhuma atividade recente</td></tr>';
            return;
        }

        tableBody.innerHTML = activities.map(item => `
            <tr>
                <td>
                    <span class="status-badge success">Coleta</span>
                </td>
                <td>
                    <div class="activity-title">Coleta de preços</div>
                    <div class="activity-desc">${item.mercados_selecionados?.length || 0} mercados</div>
                </td>
                <td>${item.mercados_selecionados?.join(', ') || 'Todos'}</td>
                <td>
                    <div class="activity-date">${new Date(item.iniciada_em).toLocaleDateString('pt-BR')}</div>
                    <div class="activity-time">${new Date(item.iniciada_em).toLocaleTimeString('pt-BR')}</div>
                </td>
                <td>
                    <span class="status-badge ${item.status === 'concluida' ? 'success' : 'warning'}">
                        ${item.status === 'concluida' ? 'Concluída' : 'Em andamento'}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    setupEventListeners() {
        // Filtro de período
        const dateRange = document.getElementById('dateRange');
        if (dateRange) {
            dateRange.addEventListener('change', (e) => {
                this.filters.dateRange = e.target.value;
                if (e.target.value === 'custom') {
                    document.getElementById('customDateRange').style.display = 'flex';
                } else {
                    document.getElementById('customDateRange').style.display = 'none';
                    this.updateDateRange();
                    this.loadDashboardData();
                }
            });
        }

        // Aplicar filtros
        document.getElementById('applyFilters')?.addEventListener('click', () => {
            this.loadDashboardData();
        });

        // Exportar dados
        document.getElementById('exportData')?.addEventListener('click', () => {
            this.exportData();
        });
    }

    setupRealTimeUpdates() {
        // Atualizar dados a cada 5 minutos
        setInterval(() => {
            this.loadDashboardData();
        }, 300000);

        // Atualizar métricas em tempo real a cada 30 segundos
        setInterval(() => {
            this.updateRealTimeMetrics();
        }, 30000);
    }

    async updateRealTimeMetrics() {
        try {
            const realTimeData = await this.dataService.getRealTimeStats();
            this.updateMetrics(realTimeData.summary);
        } catch (error) {
            console.error('Erro ao atualizar métricas em tempo real:', error);
        }
    }

    updateDateRange() {
        const days = parseInt(this.filters.dateRange);
        const endDate = new Date();
        const startDate = new Date();
        
        if (days && days > 0) {
            startDate.setDate(startDate.getDate() - days);
        } else {
            startDate.setDate(startDate.getDate() - 30); // padrão 30 dias
        }
        
        this.filters.startDate = startDate.toISOString().split('T')[0];
        this.filters.endDate = endDate.toISOString().split('T')[0];
    }

    async loadAvailableDates() {
        try {
            const datesData = await this.dataService.getAvailableDates();
            if (datesData.dates && datesData.dates.length > 0) {
                // Atualizar seletor de datas com base nas coletas disponíveis
                this.updateDateSelectors(datesData);
            }
        } catch (error) {
            console.error('Erro ao carregar datas disponíveis:', error);
        }
    }

    updateDateSelectors(datesData) {
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (startDateInput && endDateInput && datesData.min_date && datesData.max_date) {
            startDateInput.min = datesData.min_date;
            startDateInput.max = datesData.max_date;
            endDateInput.min = datesData.min_date;
            endDateInput.max = datesData.max_date;
            
            // Definir datas padrão baseadas nas coletas
            if (!startDateInput.value) {
                startDateInput.value = datesData.min_date;
            }
            if (!endDateInput.value) {
                endDateInput.value = datesData.max_date;
            }
        }
    }

    async exportData() {
        try {
            const blob = await this.dataService.exportData(
                this.filters.startDate,
                this.filters.endDate,
                this.filters.market
            );
            
            this.downloadBlob(blob, `dashboard_export_${new Date().toISOString().split('T')[0]}.csv`);
            this.ui.showNotification('Dados exportados com sucesso', 'success');
        } catch (error) {
            console.error('Erro ao exportar dados:', error);
            this.ui.showNotification('Erro ao exportar dados', 'error');
        }
    }

    downloadBlob(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    showProductSearchModal(index) {
        const modal = this.ui.createModal({
            title: 'Buscar Produto',
            size: 'medium',
            content: `
                <div class="product-search-modal">
                    <div class="search-input">
                        <input type="text" id="productSearchInput" placeholder="Digite o nome do produto...">
                        <button class="btn primary" id="searchProductBtn">
                            <i class="fas fa-search"></i> Buscar
                        </button>
                    </div>
                    <div class="search-results" id="productSearchResults"></div>
                </div>
            `
        });

        modal.render();
        modal.show();

        // Configurar busca
        document.getElementById('searchProductBtn').addEventListener('click', async () => {
            const query = document.getElementById('productSearchInput').value;
            if (query.length < 2) return;

            try {
                const suggestions = await this.dataService.getProductSuggestions(query);
                this.displayProductSuggestions(suggestions, index, modal);
            } catch (error) {
                console.error('Erro na busca:', error);
            }
        });
    }

    displayProductSuggestions(suggestions, index, modal) {
        const resultsContainer = document.getElementById('productSearchResults');
        if (!resultsContainer) return;

        if (suggestions.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">Nenhum produto encontrado</div>';
            return;
        }

        resultsContainer.innerHTML = suggestions.map(product => `
            <div class="product-suggestion" data-barcode="${product.codigo_barras}">
                <div class="product-name">${product.nome_produto}</div>
                <div class="product-barcode">${product.codigo_barras || 'Sem código'}</div>
                <button class="btn small outline select-product">Selecionar</button>
            </div>
        `).join('');

        // Event listeners para seleção
        resultsContainer.querySelectorAll('.select-product').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const suggestion = e.target.closest('.product-suggestion');
                const barcode = suggestion.dataset.barcode;
                const productName = suggestion.querySelector('.product-name').textContent;
                
                // Atualizar o input correspondente
                const barcodeInput = this.components.get('barcodeInput');
                if (barcodeInput) {
                    barcodeInput.barcodes[index] = barcode;
                    barcodeInput.updateInputs();
                    barcodeInput.showProductInfo({ nome_produto: productName }, index);
                }
                
                modal.hide();
                modal.destroy();
            });
        });
    }

    startBarcodeScan() {
        this.ui.showNotification('Funcionalidade de scan em desenvolvimento', 'info');
        // Implementar scan de código de barras usando camera API
    }

    zoomChart(chart) {
        const modal = this.ui.createModal({
            title: 'Gráfico Expandido',
            size: 'xlarge',
            content: `<canvas id="expandedChart" width="800" height="400"></canvas>`
        });

        modal.render();
        modal.show();

        // Recriar o gráfico no modal
        const canvas = document.getElementById('expandedChart');
        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: chart.config.type,
            data: chart.data,
            options: {
                ...chart.options,
                maintainAspectRatio: false,
                responsive: false
            }
        });
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎯 Inicializando Dashboard...');
    window.dashboard = new Dashboard();
});
