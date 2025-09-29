// price-sorter.js - Ordenação e coloração de preços (versão sem piscagem)
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se estamos na página de busca
    if (!document.getElementById('resultsGrid')) return;
    
    // Aguardar um pouco para garantir que o script.js principal foi carregado
    setTimeout(initializePriceSorter, 100);
});

function initializePriceSorter() {
    // Elementos do DOM
    const resultsGrid = document.getElementById('resultsGrid');
    const sortFilter = document.getElementById('sortFilter');
    
    if (!sortFilter || !resultsGrid) return;
    
    // Adicionar opção de ordenação por preço se não existir
    addSortOptionIfNeeded();
    
    // Variáveis para controle de cores
    let minPrice = 0;
    let maxPrice = 0;
    let currentResults = [];
    let isProcessing = false;
    let isSorting = false;
    
    // Adicionar listener para o filtro de ordenação
    sortFilter.addEventListener('change', handleSortChange);
    
    // Observar mudanças no grid de resultados
    observeResultsGrid();
    
    // Observar mudanças no tema
    observeThemeChanges();
    
    // Adicionar CSS personalizado
    addCustomStyles();
    
    console.log('Price sorter inicializado com sucesso!');
    
    function addSortOptionIfNeeded() {
        if (!sortFilter.querySelector('option[value="cheap"]')) {
            const cheapOption = document.createElement('option');
            cheapOption.value = 'cheap';
            cheapOption.textContent = 'Preço: mais barato';
            sortFilter.appendChild(cheapOption);
        }
    }
    
    function handleSortChange() {
        if (sortFilter.value === 'cheap' && !isSorting) {
            applyPriceSorting();
        } else if (sortFilter.value !== 'cheap') {
            // Se mudou para outra ordenação, remover as cores especiais
            removePriceColors();
        }
    }
    
    function observeResultsGrid() {
        // Observar mudanças no grid de resultados
        const observer = new MutationObserver((mutations) => {
            // Se já está processando, ignora novas mutações
            if (isProcessing || isSorting) return;
            
            let hasNewProducts = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    // Verifica se foram adicionados novos product-cards
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && (node.classList?.contains('product-card') || 
                            node.querySelector?.('.product-card'))) {
                            hasNewProducts = true;
                        }
                    });
                }
            });
            
            if (hasNewProducts) {
                isProcessing = true;
                
                // Aguardar um pouco para garantir que os resultados foram renderizados
                setTimeout(() => {
                    processResults();
                    isProcessing = false;
                }, 300);
            }
        });
        
        observer.observe(resultsGrid, { 
            childList: true, 
            subtree: true 
        });
        
        // Processar resultados iniciais
        setTimeout(() => {
            if (!isProcessing) {
                processResults();
            }
        }, 1000);
    }
    
    function observeThemeChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    setTimeout(applyPriceColors, 100);
                }
            });
        });
        
        observer.observe(document.body, { attributes: true });
    }
    
    function processResults() {
        // Extrair resultados dos elementos do DOM
        const productCards = resultsGrid.querySelectorAll('.product-card');
        if (productCards.length === 0) return;
        
        console.log(`Processando ${productCards.length} produtos...`);
        
        // Reconstruir array de resultados a partir do DOM
        currentResults = Array.from(productCards).map(card => {
            const price = extractPriceFromCard(card);
            
            return {
                preco_produto: price,
                element: card
            };
        });
        
        // Calcular faixa de preços
        calculatePriceRange();
        
        // Aplicar cores
        applyPriceColors();
        
        console.log(`Preços: min R$ ${minPrice.toFixed(2)}, max R$ ${maxPrice.toFixed(2)}`);
    }
    
    function calculatePriceRange() {
        const validPrices = currentResults
            .filter(item => item.preco_produto > 0)
            .map(item => item.preco_produto);
        
        if (validPrices.length === 0) {
            minPrice = 0;
            maxPrice = 0;
            return;
        }
        
        minPrice = Math.min(...validPrices);
        maxPrice = Math.max(...validPrices);
    }
    
    function applyPriceColors() {
        if (isSorting) return;
        
        const productCards = resultsGrid.querySelectorAll('.product-card');
        
        productCards.forEach(card => {
            const priceElement = card.querySelector('.product-price');
            if (!priceElement) return;
            
            // Remover estilos anteriores e classes
            priceElement.style.color = '';
            priceElement.style.fontWeight = '';
            priceElement.style.background = '';
            priceElement.style.padding = '';
            priceElement.style.borderRadius = '';
            priceElement.classList.remove('price-cheapest', 'price-most-expensive', 'price-min', 'price-max');
            
            const price = extractPriceFromCard(card);
            
            if (isNaN(price) || price <= 0 || minPrice === maxPrice) {
                // Preço inválido ou todos iguais - aplicar cor padrão
                applyDefaultColor(priceElement);
                return;
            }
            
            // Aplicar cores baseadas na posição do preço
            if (price === minPrice) {
                // Preço mais barato - Verde
                priceElement.classList.add('price-cheapest', 'price-min');
            } else if (price === maxPrice) {
                // Preço mais caro - Vermelho
                priceElement.classList.add('price-most-expensive', 'price-max');
            } else {
                // Preço intermediário - cor padrão
                applyDefaultColor(priceElement);
            }
        });
    }
    
    function removePriceColors() {
        const productCards = resultsGrid.querySelectorAll('.product-card');
        
        productCards.forEach(card => {
            const priceElement = card.querySelector('.product-price');
            if (!priceElement) return;
            
            // Remover todas as classes e estilos de cor
            priceElement.style.color = '';
            priceElement.style.fontWeight = '';
            priceElement.classList.remove('price-cheapest', 'price-most-expensive', 'price-min', 'price-max');
            
            // Aplicar cor padrão
            applyDefaultColor(priceElement);
        });
    }
    
    function applyDefaultColor(element) {
        const isLightMode = document.body.classList.contains('light-mode');
        if (isLightMode) {
            element.style.color = '#111827';
        } else {
            element.style.color = '#ffffff';
        }
    }
    
    function applyPriceSorting() {
        if (isSorting) return;
        
        const productCards = Array.from(resultsGrid.querySelectorAll('.product-card'));
        if (productCards.length === 0) {
            console.log('Nenhum card encontrado para ordenar');
            return;
        }
        
        console.log(`Ordenando ${productCards.length} produtos por preço...`);
        isSorting = true;
        
        // Ordenar cards por preço (crescente)
        productCards.sort((a, b) => {
            const priceA = extractPriceFromCard(a);
            const priceB = extractPriceFromCard(b);
            
            return priceA - priceB;
        });
        
        // Criar fragmento para atualização em lote
        const fragment = document.createDocumentFragment();
        
        // Adicionar cards ordenados ao fragmento
        productCards.forEach(card => {
            fragment.appendChild(card);
        });
        
        // Fazer a substituição de uma vez só
        const existingProductCards = Array.from(resultsGrid.querySelectorAll('.product-card'));
        existingProductCards.forEach(card => card.remove());
        
        resultsGrid.appendChild(fragment);
        
        console.log('Produtos ordenados por preço crescente');
        
        // Reaplicar cores após reordenar
        setTimeout(() => {
            processResults();
            isSorting = false;
        }, 150);
    }
    
    function extractPriceFromCard(card) {
        const priceElement = card.querySelector('.product-price');
        if (!priceElement) {
            return 0;
        }
        
        const priceText = priceElement.textContent
            .replace('R$', '')
            .replace(/\./g, '')
            .replace(',', '.')
            .trim();
        
        const price = parseFloat(priceText);
        
        if (isNaN(price)) {
            return 0;
        }
        
        return price;
    }
    
    function addCustomStyles() {
        // Verificar se o estilo já foi adicionado
        if (document.getElementById('price-sorter-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'price-sorter-styles';
        style.textContent = `
            .product-price.price-cheapest,
            .product-price.price-min {
                color: #10b981 !important;
                font-weight: 700 !important;
            }
            
            .product-price.price-most-expensive,
            .product-price.price-max {
                color: #ef4444 !important;
                font-weight: 700 !important;
            }
            
            .theme-dark .product-price.price-cheapest,
            .theme-dark .product-price.price-min {
                color: #34d399 !important;
            }
            
            .theme-dark .product-price.price-most-expensive,
            .theme-dark .product-price.price-max {
                color: #f87171 !important;
            }
            
            .product-card {
                transition: transform 0.2s ease;
            }
            
            .product-card:hover {
                transform: translateY(-2px);
            }
        `;
        document.head.appendChild(style);
    }
}
