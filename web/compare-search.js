// Script específico para busca em tempo real por nome no comparador
class ProductNameSearch {
    constructor() {
        this.currentSearchTerm = '';
        this.searchTimeout = null;
        this.selectedMarkets = new Set();
        this.init();
    }

    init() {
        this.productNameInput = document.getElementById('productNameInput');
        if (!this.productNameInput) {
            console.error('Campo productNameInput não encontrado');
            return;
        }

        this.createResultsContainer();
        this.setupEventListeners();
        this.loadSelectedMarkets();
    }

    createResultsContainer() {
        // Remove container existente se houver
        const existingContainer = document.getElementById('searchResultsDropdown');
        if (existingContainer) {
            existingContainer.remove();
        }

        // Cria novo container
        this.resultsContainer = document.createElement('div');
        this.resultsContainer.id = 'searchResultsDropdown';
        this.resultsContainer.className = 'search-results-dropdown';
        
        // Insere após o campo de input
        this.productNameInput.parentNode.appendChild(this.resultsContainer);
    }

    setupEventListeners() {
        // Input com debounce
        this.productNameInput.addEventListener('input', (e) => {
            this.handleInput(e.target.value.trim());
        });

        // Fechar resultados ao clicar fora
        document.addEventListener('click', (e) => {
            if (!this.productNameInput.contains(e.target) && 
                !this.resultsContainer.contains(e.target)) {
                this.hideResults();
            }
        });

        // Navegação com teclado
        this.productNameInput.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });
    }

    loadSelectedMarkets() {
        // Tenta obter os mercados selecionados do compare.js
        try {
            const marketCards = document.querySelectorAll('.market-card.selected');
            this.selectedMarkets = new Set();
            
            marketCards.forEach(card => {
                const cnpj = card.querySelector('.market-cnpj')?.textContent;
                if (cnpj) {
                    this.selectedMarkets.add(cnpj);
                }
            });
            
            console.log('Mercados selecionados para busca:', this.selectedMarkets.size);
        } catch (error) {
            console.warn('Não foi possível carregar mercados selecionados:', error);
        }
    }

    handleInput(searchTerm) {
        // Limpar timeout anterior
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        // Esconder resultados se busca estiver vazia
        if (searchTerm.length === 0) {
            this.hideResults();
            return;
        }

        // Atualizar mercados selecionados
        this.loadSelectedMarkets();

        // Verificar se há mercados selecionados
        if (this.selectedMarkets.size === 0) {
            this.showMessage('Selecione pelo menos um mercado para buscar');
            return;
        }

        // Aguardar antes de buscar (debounce)
        this.searchTimeout = setTimeout(() => {
            this.performSearch(searchTerm);
        }, 600);
    }

    handleKeydown(e) {
        switch (e.key) {
            case 'Escape':
                this.hideResults();
                this.productNameInput.blur();
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.focusFirstResult();
                break;
            case 'Enter':
                if (this.currentSearchTerm.length >= 3) {
                    this.performSearch(this.currentSearchTerm);
                }
                break;
        }
    }

    async performSearch(searchTerm) {
        if (searchTerm.length < 3) {
            this.showMessage('Digite pelo menos 3 caracteres');
            return;
        }

        this.currentSearchTerm = searchTerm;

        try {
            this.showLoading();

            const session = await this.getSession();
            if (!session) {
                this.showMessage('Você precisa estar logado para buscar');
                return;
            }

            const response = await fetch('/api/realtime-search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ 
                    nome_produto: searchTerm,
                    cnpjs: Array.from(this.selectedMarkets)
                })
            });

            if (!response.ok) {
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Só mostrar resultados se o termo ainda for o mesmo
            if (searchTerm === this.currentSearchTerm) {
                this.displayResults(data.results || []);
            }

        } catch (error) {
            console.error('Erro na busca:', error);
            if (searchTerm === this.currentSearchTerm) {
                this.showMessage('Erro ao buscar produtos. Tente novamente.');
            }
        }
    }

    displayResults(results) {
        if (results.length === 0) {
            this.showMessage(`Nenhum produto encontrado para "${this.currentSearchTerm}"`);
            return;
        }

        // Agrupar por produto para evitar duplicatas
        const uniqueProducts = this.groupProducts(results);
        
        this.resultsContainer.innerHTML = uniqueProducts.map(product => `
            <div class="search-result-item" data-product-name="${this.escapeHtml(product.nome)}">
                <div class="product-main-info">
                    <div class="product-name">${this.escapeHtml(product.nome)}</div>
                    ${product.marca ? `<div class="product-brand">${this.escapeHtml(product.marca)}</div>` : ''}
                    ${product.codigo_barras ? `<div class="product-barcode">Código: ${product.codigo_barras}</div>` : ''}
                </div>
                <div class="product-stats">
                    ${product.preco_minimo > 0 ? `
                        <div class="price-range">
                            <span class="min-price">R$ ${product.preco_minimo.toFixed(2)}</span>
                            ${product.preco_maximo > product.preco_minimo ? 
                                ` - R$ ${product.preco_maximo.toFixed(2)}` : ''}
                        </div>
                    ` : ''}
                    <div class="market-count">
                        <i class="fas fa-store"></i>
                        ${product.mercados_count} mercado(s)
                    </div>
                </div>
                <button class="select-product-btn" onclick="productSearch.selectProduct('${this.escapeHtml(product.nome)}')">
                    <i class="fas fa-plus"></i>
                    Selecionar
                </button>
            </div>
        `).join('');

        this.resultsContainer.style.display = 'block';
    }

    groupProducts(results) {
        const productsMap = new Map();
        
        results.forEach(item => {
            const key = item.codigo_barras || item.nome_produto;
            if (!productsMap.has(key)) {
                productsMap.set(key, {
                    nome: item.nome_produto,
                    marca: item.marca || '',
                    codigo_barras: item.codigo_barras || '',
                    preco_minimo: Infinity,
                    preco_maximo: 0,
                    mercados_count: 0
                });
            }
            
            const product = productsMap.get(key);
            product.mercados_count++;
            
            const price = item.preco_produto || 0;
            if (price > 0) {
                product.preco_minimo = Math.min(product.preco_minimo, price);
                product.preco_maximo = Math.max(product.preco_maximo, price);
            }
        });

        // Ajustar preço mínimo
        Array.from(productsMap.values()).forEach(product => {
            if (product.preco_minimo === Infinity) {
                product.preco_minimo = 0;
            }
        });

        return Array.from(productsMap.values());
    }

    selectProduct(productName) {
        // Preencher o campo com o nome selecionado
        this.productNameInput.value = productName;
        this.hideResults();
        
        // Disparar evento de input para atualizar o estado do botão
        this.productNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        this.showNotification(`"${productName}" selecionado para comparação`, 'success');
    }

    focusFirstResult() {
        const firstResult = this.resultsContainer.querySelector('.search-result-item');
        if (firstResult) {
            firstResult.focus();
        }
    }

    showLoading() {
        this.resultsContainer.innerHTML = `
            <div class="search-result-item loading">
                <div class="loader-small"></div>
                <span>Buscando "${this.currentSearchTerm}"...</span>
            </div>
        `;
        this.resultsContainer.style.display = 'block';
    }

    showMessage(message) {
        this.resultsContainer.innerHTML = `
            <div class="search-result-item message">
                <i class="fas fa-info-circle"></i>
                <span>${message}</span>
            </div>
        `;
        this.resultsContainer.style.display = 'block';
    }

    hideResults() {
        this.resultsContainer.style.display = 'none';
    }

    async getSession() {
        // Usa a função do auth.js se disponível
        if (typeof getSession === 'function') {
            return await getSession();
        }
        
        // Fallback: tenta obter da sessionStorage
        try {
            const sessionData = sessionStorage.getItem('supabase.auth.token');
            return sessionData ? JSON.parse(sessionData) : null;
        } catch {
            return null;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        notification.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Animação de entrada
        setTimeout(() => notification.classList.add('show'), 10);
        
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

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.productSearch = new ProductNameSearch();
});

// Também inicializar quando a página terminar de carregar
window.addEventListener('load', () => {
    if (!window.productSearch) {
        window.productSearch = new ProductNameSearch();
    }
});