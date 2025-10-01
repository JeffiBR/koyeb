document.addEventListener('DOMContentLoaded', () => {
    const productNameInput = document.getElementById('productNameInput');
    const searchResults = document.getElementById('searchResults');
    
    // Criar container para resultados se não existir
    if (!searchResults) {
        const resultsContainer = document.createElement('div');
        resultsContainer.id = 'searchResults';
        resultsContainer.className = 'search-results-dropdown';
        productNameInput.parentNode.appendChild(resultsContainer);
    }

    let currentSearchTerm = '';
    let searchTimeout = null;

    // Configurar evento de input com debounce
    productNameInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim();
        
        // Limpar timeout anterior
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        // Esconder resultados se busca estiver vazia
        if (searchTerm.length === 0) {
            hideResults();
            return;
        }

        // Aguardar 500ms antes de buscar (debounce)
        searchTimeout = setTimeout(() => {
            performRealtimeSearch(searchTerm);
        }, 500);
    });

    // Esconder resultados ao clicar fora
    document.addEventListener('click', (e) => {
        if (!productNameInput.contains(e.target) && !searchResults.contains(e.target)) {
            hideResults();
        }
    });

    // Tecla Escape para fechar resultados
    productNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideResults();
            productNameInput.blur();
        }
    });

    async function performRealtimeSearch(searchTerm) {
        if (searchTerm.length < 3) {
            hideResults();
            return;
        }

        currentSearchTerm = searchTerm;

        try {
            const session = await getSession();
            if (!session) {
                showNotification('Você precisa estar logado para realizar buscas', 'error');
                return;
            }

            // Mostrar loading
            showLoadingState();

            const response = await authenticatedFetch('/api/realtime-search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ 
                    nome_produto: searchTerm,
                    cnpjs: Array.from(selectedMarkets) // Usar mercados selecionados se disponível
                })
            });

            if (!response.ok) {
                throw new Error('Falha na busca');
            }

            const data = await response.json();
            
            // Só processar resultados se o termo de busca ainda for o mesmo
            if (searchTerm === currentSearchTerm) {
                displaySearchResults(data.results || []);
            }

        } catch (error) {
            console.error('Erro na busca em tempo real:', error);
            if (searchTerm === currentSearchTerm) {
                showErrorState('Erro ao buscar produtos');
            }
        }
    }

    function displaySearchResults(results) {
        const searchResults = document.getElementById('searchResults');
        
        if (results.length === 0) {
            searchResults.innerHTML = `
                <div class="search-result-item no-results">
                    <i class="fas fa-search"></i>
                    <span>Nenhum produto encontrado para "${currentSearchTerm}"</span>
                </div>
            `;
            searchResults.style.display = 'block';
            return;
        }

        // Agrupar resultados por produto (evitar duplicatas)
        const productsMap = new Map();
        
        results.forEach(item => {
            const productKey = item.codigo_barras || item.nome_produto;
            if (!productsMap.has(productKey)) {
                productsMap.set(productKey, {
                    nome: item.nome_produto,
                    marca: item.marca || '',
                    codigo_barras: item.codigo_barras || '',
                    categoria: item.categoria || '',
                    preco_medio: 0,
                    mercados: 0
                });
            }
            
            const product = productsMap.get(productKey);
            product.mercados++;
            if (item.preco_produto && item.preco_produto > 0) {
                product.preco_medio = product.preco_medio === 0 ? 
                    item.preco_produto : (product.preco_medio + item.preco_produto) / 2;
            }
        });

        const uniqueProducts = Array.from(productsMap.values());
        
        searchResults.innerHTML = uniqueProducts.map(product => `
            <div class="search-result-item" data-barcode="${product.codigo_barras}">
                <div class="product-info">
                    <div class="product-name">${product.nome}</div>
                    ${product.marca ? `<div class="product-brand">${product.marca}</div>` : ''}
                    ${product.codigo_barras ? `<div class="product-barcode">Código: ${product.codigo_barras}</div>` : ''}
                </div>
                <div class="product-stats">
                    ${product.preco_medio > 0 ? `
                        <div class="avg-price">R$ ${product.preco_medio.toFixed(2)}</div>
                    ` : ''}
                    <div class="market-count">
                        <i class="fas fa-store"></i>
                        ${product.mercados} mercado(s)
                    </div>
                </div>
                <button class="select-product-btn" onclick="selectProductForComparison('${product.codigo_barras || product.nome}', '${product.nome.replace(/'/g, "\\'")}')">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        `).join('');

        searchResults.style.display = 'block';
    }

    function showLoadingState() {
        const searchResults = document.getElementById('searchResults');
        searchResults.innerHTML = `
            <div class="search-result-item loading">
                <div class="loader-small"></div>
                <span>Buscando produtos...</span>
            </div>
        `;
        searchResults.style.display = 'block';
    }

    function showErrorState(message) {
        const searchResults = document.getElementById('searchResults');
        searchResults.innerHTML = `
            <div class="search-result-item error">
                <i class="fas fa-exclamation-circle"></i>
                <span>${message}</span>
            </div>
        `;
        searchResults.style.display = 'block';
    }

    function hideResults() {
        const searchResults = document.getElementById('searchResults');
        searchResults.style.display = 'none';
    }

    // Função global para selecionar produto (chamada pelo HTML)
    window.selectProductForComparison = function(barcodeOrName, productName) {
        if (barcodeOrName && /^\d+$/.test(barcodeOrName)) {
            // É um código de barras - adicionar ao campo de códigos
            const barcodesInput = document.getElementById('barcodesInput');
            const currentBarcodes = barcodesInput.value.trim();
            const barcodesArray = currentBarcodes ? currentBarcodes.split(',').map(b => b.trim()) : [];
            
            if (!barcodesArray.includes(barcodeOrName)) {
                if (barcodesArray.length >= 10) {
                    showNotification('Máximo de 10 códigos de barras atingido', 'warning');
                    return;
                }
                
                barcodesArray.push(barcodeOrName);
                barcodesInput.value = barcodesArray.join(', ');
                
                showNotification(`Produto "${productName}" adicionado para comparação`, 'success');
            }
        } else {
            // É um nome de produto - preencher o campo de nome
            productNameInput.value = productName;
            showNotification(`Produto "${productName}" selecionado para comparação`, 'success');
        }
        
        hideResults();
        validateInputs(); // Atualizar estado do botão de comparação
    };
});

// Função utilitária para mostrar notificações
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