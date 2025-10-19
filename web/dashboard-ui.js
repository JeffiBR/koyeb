// dashboard-ui.js - Componentes de interface do usuário

class DashboardUI {
    constructor() {
        this.components = new Map();
    }

    // Componente de métricas em tempo real
    createMetricCard(id, config) {
        return {
            id: id,
            config: config,
            element: null,
            
            render(container) {
                this.element = document.createElement('div');
                this.element.className = 'metric-card';
                this.element.innerHTML = `
                    <div class="metric-icon ${config.iconType || 'primary'}">
                        <i class="${config.icon}"></i>
                    </div>
                    <div class="metric-info">
                        <h3 id="${id}-value">0</h3>
                        <p>${config.title}</p>
                    </div>
                    <div class="metric-trend" id="${id}-trend">
                        <i class="fas fa-minus"></i>
                        <span>0%</span>
                    </div>
                    ${config.badge ? `<div class="metric-badge">${config.badge}</div>` : ''}
                `;
                
                if (container) {
                    container.appendChild(this.element);
                }
                
                return this.element;
            },
            
            update(value, trend = null, additionalInfo = null) {
                const valueElement = document.getElementById(`${id}-value`);
                const trendElement = document.getElementById(`${id}-trend`);
                
                if (valueElement) {
                    valueElement.textContent = typeof value === 'number' 
                        ? value.toLocaleString('pt-BR') 
                        : value;
                }
                
                if (trendElement && trend !== null) {
                    const isPositive = trend > 0;
                    trendElement.className = `metric-trend ${isPositive ? 'positive' : 'negative'}`;
                    trendElement.innerHTML = `
                        <i class="fas fa-arrow-${isPositive ? 'up' : 'down'}"></i>
                        <span>${Math.abs(trend).toFixed(1)}%</span>
                    `;
                }
                
                if (additionalInfo && config.onUpdate) {
                    config.onUpdate(this.element, additionalInfo);
                }
            }
        };
    }

    // Componente de seleção de mercados
    createMarketSelector(config) {
        return {
            config: config,
            selectedMarkets: new Set(),
            
            render(container) {
                const element = document.createElement('div');
                element.className = 'market-selector';
                element.innerHTML = `
                    <div class="selector-header">
                        <h4>${config.title || 'Selecionar Mercados'}</h4>
                        <div class="selector-actions">
                            <button class="btn small outline" id="selectAllMarkets">
                                <i class="fas fa-check-double"></i> Selecionar Todos
                            </button>
                            <button class="btn small outline" id="clearMarkets">
                                <i class="fas fa-times"></i> Limpar
                            </button>
                        </div>
                    </div>
                    <div class="market-search">
                        <input type="text" id="marketSearch" placeholder="Buscar mercado...">
                        <i class="fas fa-search"></i>
                    </div>
                    <div class="markets-grid" id="marketsGrid">
                        <!-- Mercados serão carregados aqui -->
                    </div>
                    <div class="selection-summary">
                        <span id="selectedCount">0</span> mercados selecionados
                    </div>
                `;
                
                if (container) {
                    container.appendChild(element);
                }
                
                this.setupEventListeners(element);
                return element;
            },
            
            setupEventListeners(element) {
                // Busca
                const searchInput = element.querySelector('#marketSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', (e) => {
                        this.filterMarkets(e.target.value);
                    });
                }
                
                // Selecionar todos
                const selectAllBtn = element.querySelector('#selectAllMarkets');
                if (selectAllBtn) {
                    selectAllBtn.addEventListener('click', () => {
                        this.selectAll();
                    });
                }
                
                // Limpar seleção
                const clearBtn = element.querySelector('#clearMarkets');
                if (clearBtn) {
                    clearBtn.addEventListener('click', () => {
                        this.clearSelection();
                    });
                }
            },
            
            loadMarkets(markets) {
                const grid = document.getElementById('marketsGrid');
                if (!grid) return;
                
                grid.innerHTML = markets.map(market => `
                    <div class="market-card" data-market-id="${market.cnpj}">
                        <label class="market-checkbox">
                            <input type="checkbox" value="${market.cnpj}">
                            <span class="checkmark"></span>
                        </label>
                        <div class="market-info">
                            <div class="market-name">${market.nome}</div>
                            ${market.endereco ? `<div class="market-address">${market.endereco}</div>` : ''}
                        </div>
                        <div class="market-stats">
                            <div class="stat">
                                <i class="fas fa-shopping-basket"></i>
                                <span class="stat-value">-</span>
                            </div>
                        </div>
                    </div>
                `).join('');
                
                // Event listeners para os checkboxes
                grid.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.addEventListener('change', (e) => {
                        this.toggleMarket(e.target.value, e.target.checked);
                    });
                });
            },
            
            toggleMarket(marketId, selected) {
                if (selected) {
                    this.selectedMarkets.add(marketId);
                } else {
                    this.selectedMarkets.delete(marketId);
                }
                this.updateSelectionSummary();
                
                if (this.config.onChange) {
                    this.config.onChange(Array.from(this.selectedMarkets));
                }
            },
            
            selectAll() {
                const checkboxes = document.querySelectorAll('#marketsGrid input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = true;
                    this.selectedMarkets.add(checkbox.value);
                });
                this.updateSelectionSummary();
                
                if (this.config.onChange) {
                    this.config.onChange(Array.from(this.selectedMarkets));
                }
            },
            
            clearSelection() {
                const checkboxes = document.querySelectorAll('#marketsGrid input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
                this.selectedMarkets.clear();
                this.updateSelectionSummary();
                
                if (this.config.onChange) {
                    this.config.onChange([]);
                }
            },
            
            filterMarkets(query) {
                const marketCards = document.querySelectorAll('.market-card');
                const searchTerm = query.toLowerCase();
                
                marketCards.forEach(card => {
                    const marketName = card.querySelector('.market-name').textContent.toLowerCase();
                    const marketAddress = card.querySelector('.market-address')?.textContent.toLowerCase() || '';
                    
                    if (marketName.includes(searchTerm) || marketAddress.includes(searchTerm)) {
                        card.style.display = 'flex';
                    } else {
                        card.style.display = 'none';
                    }
                });
            },
            
            updateSelectionSummary() {
                const countElement = document.getElementById('selectedCount');
                if (countElement) {
                    countElement.textContent = this.selectedMarkets.size;
                }
            },
            
            getSelectedMarkets() {
                return Array.from(this.selectedMarkets);
            }
        };
    }

    // Componente de entrada de códigos de barras
    createBarcodeInput(config) {
        return {
            config: config,
            barcodes: [''],
            
            render(container) {
                const element = document.createElement('div');
                element.className = 'barcode-input-container';
                element.innerHTML = `
                    <div class="input-header">
                        <h4>${config.title || 'Códigos de Barras'}</h4>
                        <span class="input-subtitle">Máximo ${config.maxItems || 5} produtos</span>
                    </div>
                    <div class="barcode-inputs" id="barcodeInputs">
                        <!-- Inputs serão gerados aqui -->
                    </div>
                    <div class="input-actions">
                        <button class="btn small primary" id="addBarcode">
                            <i class="fas fa-plus"></i> Adicionar Produto
                        </button>
                        <button class="btn small outline" id="scanBarcode">
                            <i class="fas fa-camera"></i> Escanear
                        </button>
                    </div>
                    <div class="product-suggestions" id="productSuggestions"></div>
                `;
                
                if (container) {
                    container.appendChild(element);
                }
                
                this.updateInputs();
                this.setupEventListeners();
                return element;
            },
            
            updateInputs() {
                const container = document.getElementById('barcodeInputs');
                if (!container) return;
                
                container.innerHTML = this.barcodes.map((barcode, index) => `
                    <div class="barcode-input-group" data-index="${index}">
                        <div class="input-wrapper">
                            <input 
                                type="text" 
                                class="barcode-input" 
                                placeholder="Digite o código de barras"
                                value="${barcode}"
                                data-index="${index}"
                            >
                            <button type="button" class="btn-icon search-product" data-index="${index}">
                                <i class="fas fa-search"></i>
                            </button>
                        </div>
                        ${index > 0 ? `
                            <button type="button" class="btn-icon remove-barcode" data-index="${index}">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                    </div>
                `).join('');
                
                // Adicionar event listeners
                container.querySelectorAll('.barcode-input').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const index = parseInt(e.target.dataset.index);
                        this.barcodes[index] = e.target.value;
                        this.handleBarcodeInput(e.target.value, index);
                    });
                    
                    input.addEventListener('focus', (e) => {
                        e.target.parentElement.classList.add('focused');
                    });
                    
                    input.addEventListener('blur', (e) => {
                        e.target.parentElement.classList.remove('focused');
                    });
                });
                
                container.querySelectorAll('.remove-barcode').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const index = parseInt(e.target.closest('.remove-barcode').dataset.index);
                        this.removeBarcode(index);
                    });
                });
                
                container.querySelectorAll('.search-product').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const index = parseInt(e.target.closest('.search-product').dataset.index);
                        this.showProductSearch(index);
                    });
                });
            },
            
            handleBarcodeInput(value, index) {
                if (value.length >= 8) {
                    this.searchProduct(value, index);
                }
            },
            
            async searchProduct(barcode, index) {
                try {
                    const suggestionsContainer = document.getElementById('productSuggestions');
                    if (!suggestionsContainer) return;
                    
                    // Simular busca de produto
                    if (this.config.onProductSearch) {
                        const productInfo = await this.config.onProductSearch(barcode);
                        if (productInfo) {
                            this.showProductInfo(productInfo, index);
                        }
                    }
                } catch (error) {
                    console.error('Erro na busca do produto:', error);
                }
            },
            
            showProductInfo(productInfo, index) {
                const inputGroup = document.querySelector(`.barcode-input-group[data-index="${index}"]`);
                if (!inputGroup) return;
                
                let infoElement = inputGroup.querySelector('.product-info');
                if (!infoElement) {
                    infoElement = document.createElement('div');
                    infoElement.className = 'product-info';
                    inputGroup.appendChild(infoElement);
                }
                
                infoElement.innerHTML = `
                    <div class="product-name">${productInfo.nome_produto}</div>
                    <div class="product-unit">${productInfo.tipo_unidade || 'UN'}</div>
                `;
            },
            
            showProductSearch(index) {
                // Implementar modal de busca de produtos
                if (this.config.onShowProductSearch) {
                    this.config.onShowProductSearch(index);
                }
            },
            
            addBarcode() {
                if (this.barcodes.length < (this.config.maxItems || 5)) {
                    this.barcodes.push('');
                    this.updateInputs();
                }
            },
            
            removeBarcode(index) {
                if (this.barcodes.length > 1) {
                    this.barcodes.splice(index, 1);
                    this.updateInputs();
                }
            },
            
            setupEventListeners() {
                const addBtn = document.getElementById('addBarcode');
                if (addBtn) {
                    addBtn.addEventListener('click', () => {
                        this.addBarcode();
                    });
                }
                
                const scanBtn = document.getElementById('scanBarcode');
                if (scanBtn) {
                    scanBtn.addEventListener('click', () => {
                        this.startBarcodeScan();
                    });
                }
            },
            
            startBarcodeScan() {
                // Implementar scan de código de barras
                if (this.config.onBarcodeScan) {
                    this.config.onBarcodeScan();
                }
            },
            
            getBarcodes() {
                return this.barcodes.filter(barcode => barcode.trim() !== '');
            },
            
            clear() {
                this.barcodes = [''];
                this.updateInputs();
            }
        };
    }

    // Componente de gráfico interativo
    createChart(config) {
        return {
            config: config,
            chart: null,
            
            render(container) {
                const element = document.createElement('div');
                element.className = `chart-container ${config.size || 'medium'}`;
                element.innerHTML = `
                    <div class="chart-header">
                        <h4>${config.title}</h4>
                        <div class="chart-actions">
                            <button class="btn-icon" data-action="zoom">
                                <i class="fas fa-expand"></i>
                            </button>
                            <button class="btn-icon" data-action="refresh">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                            <button class="btn-icon" data-action="download">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </div>
                    <div class="chart-wrapper">
                        <canvas id="${config.id}"></canvas>
                    </div>
                    <div class="chart-footer">
                        <div class="chart-legend" id="${config.id}-legend"></div>
                        <div class="chart-stats" id="${config.id}-stats"></div>
                    </div>
                `;
                
                if (container) {
                    container.appendChild(element);
                }
                
                this.setupEventListeners(element);
                this.initializeChart();
                return element;
            },
            
            initializeChart() {
                const canvas = document.getElementById(this.config.id);
                if (!canvas) return;
                
                const ctx = canvas.getContext('2d');
                this.chart = new Chart(ctx, {
                    type: this.config.type || 'line',
                    data: this.config.data || { datasets: [] },
                    options: this.getChartOptions()
                });
            },
            
            getChartOptions() {
                const baseOptions = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            borderColor: 'var(--primary-color)',
                            borderWidth: 1,
                            cornerRadius: 8,
                            displayColors: true,
                            callbacks: {
                                label: (context) => {
                                    const label = context.dataset.label || '';
                                    const value = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
                                    return `${label}: ${this.formatValue(value, context.dataset.format)}`;
                                }
                            }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    animation: {
                        duration: 1000,
                        easing: 'easeOutQuart'
                    }
                };
                
                return { ...baseOptions, ...this.config.options };
            },
            
            formatValue(value, format) {
                switch (format) {
                    case 'currency':
                        return new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                        }).format(value);
                    case 'percent':
                        return `${value.toFixed(2)}%`;
                    case 'integer':
                        return value.toLocaleString('pt-BR');
                    default:
                        return value.toFixed(2);
                }
            },
            
            updateData(newData) {
                if (!this.chart) return;
                
                this.chart.data = newData;
                this.chart.update('active');
                this.updateLegend();
                this.updateStats();
            },
            
            updateLegend() {
                const legendContainer = document.getElementById(`${this.config.id}-legend`);
                if (!legendContainer || !this.chart) return;
                
                const datasets = this.chart.data.datasets;
                legendContainer.innerHTML = datasets.map(dataset => `
                    <div class="legend-item">
                        <span class="legend-color" style="background-color: ${dataset.borderColor}"></span>
                        <span class="legend-label">${dataset.label}</span>
                    </div>
                `).join('');
            },
            
            updateStats() {
                const statsContainer = document.getElementById(`${this.config.id}-stats`);
                if (!statsContainer || !this.chart) return;
                
                const datasets = this.chart.data.datasets;
                if (datasets.length === 0) return;
                
                const lastData = datasets[0].data[datasets[0].data.length - 1];
                if (lastData !== undefined) {
                    statsContainer.innerHTML = `
                        <div class="stat-item">
                            <span class="stat-label">Último:</span>
                            <span class="stat-value">${this.formatValue(lastData, datasets[0].format)}</span>
                        </div>
                    `;
                }
            },
            
            setupEventListeners(element) {
                element.querySelectorAll('[data-action]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const action = e.currentTarget.dataset.action;
                        this.handleAction(action);
                    });
                });
            },
            
            handleAction(action) {
                switch (action) {
                    case 'zoom':
                        this.zoomChart();
                        break;
                    case 'refresh':
                        this.refreshChart();
                        break;
                    case 'download':
                        this.downloadChart();
                        break;
                }
            },
            
            zoomChart() {
                if (this.config.onZoom) {
                    this.config.onZoom(this.chart);
                }
            },
            
            refreshChart() {
                if (this.config.onRefresh) {
                    this.config.onRefresh();
                }
            },
            
            downloadChart() {
                if (!this.chart) return;
                
                const link = document.createElement('a');
                link.download = `${this.config.title || 'chart'}.png`;
                link.href = this.chart.toBase64Image();
                link.click();
            },
            
            destroy() {
                if (this.chart) {
                    this.chart.destroy();
                }
            }
        };
    }

    // Método para criar notificações
    showNotification(message, type = 'info', duration = 5000) {
        // Remover notificações existentes
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        
        notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas fa-${icons[type]}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.body.appendChild(notification);
        
        // Animação de entrada
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Event listener para fechar
        notification.querySelector('.notification-close').addEventListener('click', () => {
            this.hideNotification(notification);
        });
        
        // Auto-remove
        if (duration > 0) {
            setTimeout(() => {
                this.hideNotification(notification);
            }, duration);
        }
        
        return notification;
    }
    
    hideNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    // Método para criar modal
    createModal(config) {
        return {
            config: config,
            element: null,
            
            render() {
                this.element = document.createElement('div');
                this.element.className = 'modal';
                this.element.innerHTML = `
                    <div class="modal-overlay"></div>
                    <div class="modal-content ${config.size || 'large'}">
                        <div class="modal-header">
                            <h3>${config.title}</h3>
                            <button class="modal-close">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="modal-body">
                            ${config.content || ''}
                        </div>
                        ${config.footer ? `
                            <div class="modal-footer">
                                ${config.footer}
                            </div>
                        ` : ''}
                    </div>
                `;
                
                document.body.appendChild(this.element);
                this.setupEventListeners();
                return this.element;
            },
            
            setupEventListeners() {
                // Fechar modal
                this.element.querySelector('.modal-close').addEventListener('click', () => {
                    this.hide();
                });
                
                this.element.querySelector('.modal-overlay').addEventListener('click', () => {
                    this.hide();
                });
                
                // Tecla ESC
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && this.isVisible()) {
                        this.hide();
                    }
                });
            },
            
            show() {
                this.element.classList.add('show');
                document.body.style.overflow = 'hidden';
                
                if (this.config.onShow) {
                    this.config.onShow();
                }
            },
            
            hide() {
                this.element.classList.remove('show');
                document.body.style.overflow = '';
                
                if (this.config.onHide) {
                    this.config.onHide();
                }
            },
            
            isVisible() {
                return this.element.classList.contains('show');
            },
            
            updateContent(newContent) {
                const body = this.element.querySelector('.modal-body');
                if (body) {
                    body.innerHTML = newContent;
                }
            },
            
            destroy() {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
            }
        };
    }
}
