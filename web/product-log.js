document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('#productsTable tbody');
    const productsGrid = document.getElementById('productsGrid');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const prevPageBtnCard = document.getElementById('prevPageBtnCard');
    const nextPageBtnCard = document.getElementById('nextPageBtnCard');
    const pageInfo = document.getElementById('pageInfo');
    const pageInfoCard = document.getElementById('pageInfoCard');
    const totalItems = document.getElementById('totalItems');
    const totalItemsCard = document.getElementById('totalItemsCard');
    const itemsPerPage = document.getElementById('itemsPerPage');
    const searchInput = document.getElementById('searchInput');
    const supermarketFilter = document.getElementById('supermarketFilter');
    const dateFilter = document.getElementById('dateFilter');
    const priceRange = document.getElementById('priceRange');

    let currentPage = 1;
    let pageSize = parseInt(itemsPerPage.value);
    let totalCount = 0;
    let currentSort = { column: 'data_ultima_venda', direction: 'desc' };
    let searchTimeout;

    const formatarData = (dataISO) => {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };
    
    const formatarPreco = (preco) => {
        if (typeof preco !== 'number') return 'N/A';
        return `R$ ${preco.toFixed(2).replace('.', ',')}`;
    };

    const fetchLogs = async (page) => {
        try {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;"><div class="loader"></div></td></tr>`;
            productsGrid.innerHTML = '<div class="loader-container"><div class="loader"></div><p>Carregando produtos...</p></div>';
            
            const session = await getSession();
            if (!session) {
                return;
            }
            
            // Construir query parameters com filtros e ordenação
            const params = new URLSearchParams({
                page: page,
                page_size: pageSize,
                sort_by: currentSort.column,
                sort_order: currentSort.direction
            });
            
            // Adicionar filtros aos parâmetros
            if (searchInput.value) params.append('search', searchInput.value);
            if (supermarketFilter.value) params.append('supermarket', supermarketFilter.value);
            if (dateFilter.value) params.append('date', dateFilter.value);
            if (priceRange.value) params.append('price_range', priceRange.value);
            
            const response = await fetch(`/api/products-log?${params}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Falha ao carregar o log de produtos.');
            }
            
            const result = await response.json();
            const products = result.data;
            totalCount = result.total_count || 0;
            
            renderTable(products);
            renderCards(products);
            updatePaginationControls();
            updateTotalItems();

        } catch (error) {
            console.error('Erro ao carregar log de produtos:', error);
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">${error.message}</td></tr>`;
            productsGrid.innerHTML = `<div class="empty-state">${error.message}</div>`;
        }
    };

    const renderTable = (products) => {
        tableBody.innerHTML = '';

        if (products.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum produto encontrado.</td></tr>';
        } else {
            products.forEach(product => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${product.nome_produto || 'N/A'}</td>
                    <td style="font-weight: 600; color: var(--primary);">${formatarPreco(product.preco_produto)}</td>
                    <td>${product.nome_supermercado || 'N/A'}</td>
                    <td>${formatarData(product.data_ultima_venda)}</td>
                    <td>${product.codigo_barras || 'N/A'}</td>
                    <td><span class="coleta-badge">#${product.coleta_id}</span></td>
                `;
                tableBody.appendChild(row);
            });
        }
    };

    const renderCards = (products) => {
        productsGrid.innerHTML = '';

        if (products.length === 0) {
            productsGrid.innerHTML = '<div class="empty-state"><h3>Nenhum produto encontrado</h3><p>Tente ajustar os filtros para ver mais resultados.</p></div>';
        } else {
            products.forEach(product => {
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <div class="product-header">
                        <div class="product-name">${product.nome_produto || 'Produto sem nome'}</div>
                        <div class="product-price">${formatarPreco(product.preco_produto)}</div>
                    </div>
                    <div class="product-details">
                        <div class="product-detail">
                            <i class="fas fa-store"></i>
                            <span>${product.nome_supermercado || 'N/A'}</span>
                        </div>
                        <div class="product-detail">
                            <i class="fas fa-calendar"></i>
                            <span>${formatarData(product.data_ultima_venda)}</span>
                        </div>
                        <div class="product-detail">
                            <i class="fas fa-barcode"></i>
                            <span>${product.codigo_barras || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="coleta-badge">Coleta #${product.coleta_id}</div>
                `;
                productsGrid.appendChild(card);
            });
        }
    };

    const updatePaginationControls = () => {
        const totalPages = Math.ceil(totalCount / pageSize);
        pageInfo.textContent = `Página ${currentPage} de ${totalPages > 0 ? totalPages : 1}`;
        pageInfoCard.textContent = `Página ${currentPage} de ${totalPages > 0 ? totalPages : 1}`;
        
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;
        prevPageBtnCard.disabled = currentPage <= 1;
        nextPageBtnCard.disabled = currentPage >= totalPages;
    };

    const updateTotalItems = () => {
        totalItems.textContent = `Total: ${totalCount} produtos`;
        totalItemsCard.textContent = `Total: ${totalCount} produtos`;
    };

    // Event listeners para paginação
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchLogs(currentPage);
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(totalCount / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            fetchLogs(currentPage);
        }
    });

    prevPageBtnCard.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchLogs(currentPage);
        }
    });

    nextPageBtnCard.addEventListener('click', () => {
        const totalPages = Math.ceil(totalCount / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            fetchLogs(currentPage);
        }
    });

    // Alterar quantidade de itens por página
    itemsPerPage.addEventListener('change', () => {
        pageSize = parseInt(itemsPerPage.value);
        currentPage = 1;
        fetchLogs(currentPage);
    });

    // A função routeGuard (em auth.js) garante que o usuário está logado antes de chamar fetchLogs
    fetchLogs(currentPage);

    // Preencher o filtro de supermercados
    const populateSupermarketFilter = async () => {
        try {
            const session = await getSession();
            if (!session) return;
            
            const response = await fetch('/api/supermarkets', {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });
            
            if (response.ok) {
                const supermarkets = await response.json();
                supermarkets.forEach(supermarket => {
                    const option = document.createElement('option');
                    option.value = supermarket.id;
                    option.textContent = supermarket.nome;
                    supermarketFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Erro ao carregar supermercados:', error);
        }
    };

    populateSupermarketFilter();
});
