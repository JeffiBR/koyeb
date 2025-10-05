// cesta.js - Lógica da página da Cesta Básica
let userBasket = { products: [] };
let allMarkets = [];
let selectedMarkets = new Set();

// Carrega a cesta do usuário
async function loadUserBasket() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showAuthRequired();
            return;
        }

        const response = await fetch('/api/basket', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            userBasket = await response.json();
            renderProducts();
        } else {
            console.error('Erro ao carregar cesta');
        }
    } catch (error) {
        console.error('Erro:', error);
    }
}

// Carrega a lista de mercados
async function loadMarkets() {
    try {
        const response = await fetch('/api/supermarkets/public');
        if (response.ok) {
            allMarkets = await response.json();
            renderMarketSelection();
        } else {
            document.getElementById('market-selection').innerHTML = 
                '<p class="not-found">Erro ao carregar mercados</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar mercados:', error);
        document.getElementById('market-selection').innerHTML = 
            '<p class="not-found">Erro ao carregar mercados</p>';
    }
}

// Renderiza os produtos na grade
function renderProducts() {
    const grid = document.getElementById('products-grid');
    const countElement = document.getElementById('product-count');
    const emptyState = document.getElementById('empty-state');
    
    countElement.textContent = userBasket.products.length;
    
    if (userBasket.products.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" id="empty-state">
                <div class="icon">🛒</div>
                <p>Sua cesta está vazia</p>
                <p>Adicione produtos usando o código de barras acima</p>
            </div>
        `;
        return;
    }
    
    emptyState.style.display = 'none';
    grid.innerHTML = '';
    
    userBasket.products.forEach((product, index) => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <button class="remove-btn" onclick="removeProduct(${index})" title="Remover produto">×</button>
            <div class="product-info">
                <div class="product-name">${product.product_name || 'Produto não identificado'}</div>
                <div class="product-barcode">Código: ${product.product_barcode}</div>
            </div>
        `;
        grid.appendChild(productCard);
    });
}

// Renderiza a seleção de mercados
function renderMarketSelection() {
    const container = document.getElementById('market-selection');
    
    if (!allMarkets || allMarkets.length === 0) {
        container.innerHTML = '<p class="not-found">Nenhum mercado disponível</p>';
        return;
    }
    
    container.innerHTML = '';
    
    allMarkets.forEach(market => {
        const checkbox = document.createElement('label');
        checkbox.className = 'market-checkbox';
        checkbox.innerHTML = `
            <input type="checkbox" value="${market.cnpj}" onchange="toggleMarket('${market.cnpj}')">
            <span>${market.nome}</span>
        `;
        container.appendChild(checkbox);
    });
}

// Adiciona um produto à cesta
async function addProduct() {
    const barcodeInput = document.getElementById('product-barcode');
    const barcode = barcodeInput.value.trim();
    
    if (!barcode) {
        alert('Por favor, digite um código de barras');
        return;
    }
    
    // Validação básica do código de barras
    if (!/^\d+$/.test(barcode)) {
        alert('Código de barras deve conter apenas números');
        return;
    }
    
    if (barcode.length < 8) {
        alert('Código de barras muito curto');
        return;
    }
    
    if (userBasket.products.length >= 25) {
        alert('Limite de 25 produtos atingido');
        return;
    }
    
    // Verifica se o produto já existe
    if (userBasket.products.some(p => p.product_barcode === barcode)) {
        alert('Este produto já está na cesta');
        return;
    }
    
    // Busca o nome do produto
    let productName = null;
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/search?q=${encodeURIComponent(barcode)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                // Encontra o produto com o código de barras exato
                const exactProduct = data.results.find(p => p.codigo_barras === barcode);
                if (exactProduct) {
                    productName = exactProduct.nome_produto;
                } else if (data.results.length > 0) {
                    productName = data.results[0].nome_produto;
                }
            }
        }
    } catch (error) {
        console.error('Erro ao buscar nome do produto:', error);
    }
    
    // Adiciona à cesta local
    userBasket.products.push({
        product_barcode: barcode,
        product_name: productName
    });
    
    // Salva no servidor
    await saveBasket();
    renderProducts();
    barcodeInput.value = '';
    barcodeInput.focus();
}

// Remove um produto da cesta
async function removeProduct(index) {
    if (confirm('Tem certeza que deseja remover este produto da cesta?')) {
        userBasket.products.splice(index, 1);
        await saveBasket();
        renderProducts();
    }
}

// Salva a cesta no servidor
async function saveBasket() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/basket', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(userBasket)
        });
        
        if (!response.ok) {
            console.error('Erro ao salvar cesta');
            alert('Erro ao salvar cesta. Tente novamente.');
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro de conexão. Tente novamente.');
    }
}

// Gerencia a seleção de mercados
function toggleMarket(cnpj) {
    const checkboxes = document.querySelectorAll(`input[value="${cnpj}"]`);
    const checkbox = checkboxes[0];
    
    if (checkbox.checked) {
        selectedMarkets.add(cnpj);
    } else {
        selectedMarkets.delete(cnpj);
    }
}

// Calcula os preços da cesta
async function calculateBasket() {
    if (userBasket.products.length === 0) {
        alert('Adicione produtos à cesta antes de calcular');
        return;
    }
    
    if (selectedMarkets.size === 0) {
        alert('Selecione pelo menos um mercado');
        return;
    }
    
    const calculateBtn = document.getElementById('calculate-btn');
    const resultsSection = document.getElementById('results-section');
    
    calculateBtn.disabled = true;
    calculateBtn.textContent = '🔄 Calculando...';
    resultsSection.style.display = 'block';
    
    // Mostra loading nos resultados
    document.getElementById('complete-basket-details').innerHTML = '<div class="loading">Buscando preços</div>';
    document.getElementById('mixed-basket-details').innerHTML = '<div class="loading">Buscando preços</div>';
    document.getElementById('mixed-breakdown').style.display = 'none';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/basket/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                basket_id: userBasket.id,
                cnpjs: Array.from(selectedMarkets)
            })
        });
        
        if (response.ok) {
            const results = await response.json();
            displayResults(results);
        } else {
            const errorText = await response.text();
            console.error('Erro ao calcular preços:', errorText);
            alert('Erro ao calcular preços. Tente novamente.');
            
            document.getElementById('complete-basket-details').innerHTML = '<p class="not-found">Erro no cálculo</p>';
            document.getElementById('mixed-basket-details').innerHTML = '<p class="not-found">Erro no cálculo</p>';
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro de conexão. Verifique sua internet e tente novamente.');
        
        document.getElementById('complete-basket-details').innerHTML = '<p class="not-found">Erro de conexão</p>';
        document.getElementById('mixed-basket-details').innerHTML = '<p class="not-found">Erro de conexão</p>';
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.textContent = '🧮 Calcular Melhores Preços';
    }
}

// Exibe os resultados
function displayResults(results) {
    // Cesta completa mais barata
    displayCompleteBasket(results.best_complete_basket, results.complete_basket_results);
    
    // Cesta mista
    displayMixedBasket(results.mixed_basket_results);
}

function displayCompleteBasket(bestBasket, allBaskets) {
    const container = document.getElementById('complete-basket-details');
    
    if (!bestBasket) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">😕</div>
                <p>Nenhum mercado encontrou todos os produtos</p>
                <p>Tente selecionar mais mercados ou verificar os códigos de barras</p>
            </div>
        `;
        return;
    }
    
    const productsFound = bestBasket.products_found;
    const totalProducts = bestBasket.total_products;
    const coveragePercent = Math.round((productsFound / totalProducts) * 100);
    
    container.innerHTML = `
        <div class="price-highlight">R$ ${bestBasket.total.toFixed(2)}</div>
        <div style="text-align: center; margin-bottom: 15px;">
            <p><strong>🏪 ${bestBasket.market_name}</strong></p>
            <p>📊 ${productsFound}/${totalProducts} produtos encontrados (${coveragePercent}%)</p>
        </div>
        
        <div class="product-list">
            <h4 style="margin-bottom: 10px;">📦 Produtos na Cesta:</h4>
            ${bestBasket.products.map(product => `
                <div class="product-item ${!product.found ? 'not-found' : ''}">
                    <div class="product-info">
                        <div class="product-name">${product.name}</div>
                        <div class="product-barcode">${product.barcode}</div>
                    </div>
                    <div class="product-price">
                        ${product.found ? `R$ ${product.price.toFixed(2)}` : '❌ Não encontrado'}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function displayMixedBasket(mixedBasket) {
    const container = document.getElementById('mixed-basket-details');
    const breakdownContainer = document.getElementById('mixed-breakdown');
    const marketBreakdown = document.getElementById('market-breakdown');
    
    const foundProducts = mixedBasket.products.filter(p => p.found).length;
    const totalProducts = mixedBasket.products.length;
    
    container.innerHTML = `
        <div class="price-highlight">
            R$ ${mixedBasket.total.toFixed(2)}
            ${mixedBasket.economy_percent > 0 ? 
                `<span class="economy-badge">Economia de ${mixedBasket.economy_percent}%</span>` : 
                ''}
        </div>
        <div style="text-align: center; margin-bottom: 15px;">
            <p><strong>📊 ${foundProducts}/${totalProducts} produtos encontrados</strong></p>
            <p>💰 Compre cada produto no mercado mais barato</p>
        </div>
        
        <div class="product-list">
            <h4 style="margin-bottom: 10px;">🛒 Produtos e Melhores Preços:</h4>
            ${mixedBasket.products.map(product => `
                <div class="product-item ${!product.found ? 'not-found' : ''}">
                    <div class="product-info">
                        <div class="product-name">${product.name}</div>
                        <div class="product-barcode">${product.barcode}</div>
                        ${product.found ? `<small>🏪 ${product.market_name}</small>` : ''}
                    </div>
                    <div class="product-price">
                        ${product.found ? `R$ ${product.price.toFixed(2)}` : '❌ Não encontrado'}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Mostra breakdown por mercado se houver economia e múltiplos mercados
    if (mixedBasket.economy_percent > 0 && Object.keys(mixedBasket.market_breakdown).length > 1) {
        breakdownContainer.style.display = 'block';
        marketBreakdown.innerHTML = Object.values(mixedBasket.market_breakdown).map(market => `
            <div class="market-store">
                <h4>🏪 ${market.market_name}</h4>
                <div class="market-subtotal">Subtotal: R$ ${market.subtotal.toFixed(2)}</div>
                <div class="product-list">
                    ${market.products.map(product => `
                        <div class="product-item">
                            <div class="product-info">
                                <div class="product-name">${product.name}</div>
                            </div>
                            <div class="product-price">R$ ${product.price.toFixed(2)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } else {
        breakdownContainer.style.display = 'none';
    }
}

function showAuthRequired() {
    const grid = document.getElementById('products-grid');
    const marketSection = document.getElementById('market-selection');
    
    grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
            <div class="icon">🔒</div>
            <h3>Login Necessário</h3>
            <p>Faça login para gerenciar sua cesta básica</p>
            <button onclick="window.location.href='/login.html'" class="btn-primary" style="margin-top: 15px;">
                Fazer Login
            </button>
        </div>
    `;
    
    marketSection.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #666;">
            <p>Faça login para selecionar mercados</p>
        </div>
    `;
    
    document.getElementById('calculate-btn').disabled = true;
}

// Permitir adicionar produto com Enter
document.addEventListener('DOMContentLoaded', function() {
    const barcodeInput = document.getElementById('product-barcode');
    barcodeInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addProduct();
        }
    });
    
    // Inicialização
    checkAuth().then(isAuthenticated => {
        if (isAuthenticated) {
            loadUserBasket();
            loadMarkets();
        } else {
            showAuthRequired();
        }
    });
});

// Função para limpar toda a cesta
async function clearBasket() {
    if (confirm('Tem certeza que deseja limpar toda a cesta? Esta ação não pode ser desfeita.')) {
        userBasket.products = [];
        await saveBasket();
        renderProducts();
        alert('Cesta limpa com sucesso!');
    }
}

// Adicionar botão de limpar cesta (opcional - pode ser adicionado no HTML)
function addClearBasketButton() {
    const basketSection = document.querySelector('.basket-section');
    const clearButton = document.createElement('button');
    clearButton.textContent = '🗑️ Limpar Cesta';
    clearButton.className = 'btn-secondary';
    clearButton.style.marginTop = '10px';
    clearButton.onclick = clearBasket;
    
    const basketInfo = document.querySelector('.basket-info');
    basketInfo.appendChild(clearButton);
}

// Inicializar botão de limpar cesta quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(addClearBasketButton, 1000);
});
