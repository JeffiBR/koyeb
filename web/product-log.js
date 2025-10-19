// product-log.js: Core da aplicação (API, Renderização e Paginação)

// Estrutura modular para isolar o escopo e expor apenas o necessário
window.productLogApp = (function() {
    
    // Variáveis de estado mantidas no script principal
    let currentPage = 1;
    let pageSize = 20; 
    let totalCount = 0;
    let currentSort = { column: 'data_ultima_venda', direction: 'desc' };
    let currentFilters = {}; // O estado dos filtros é gerenciado aqui
    
    // Referências aos elementos de renderização e paginação
    let tableBody, productsGrid, prevPageBtn, nextPageBtn, itemsPerPageEl;
    let pageInfo, pageInfoCard, totalItems, totalItemsCard;

    // Funções de formatação (Manter as originais)
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

    /**
     * @param {object[]} logs - Dados dos produtos.
     * @param {number} totalPages - Total de páginas.
     */
    const updatePagination = (logs, totalPages) => {
        const startItem = (currentPage - 1) * pageSize + 1;
        const endItem = Math.min(currentPage * pageSize, totalCount);

        const infoText = `Página ${currentPage} de ${totalPages} (Itens ${startItem}-${endItem} de ${totalCount})`;
        
        if (pageInfo) pageInfo.textContent = infoText;
        if (pageInfoCard) pageInfoCard.textContent = infoText;

        const totalItemsText = `${totalCount} produtos encontrados.`;
        if (totalItems) totalItems.textContent = totalItemsText;
        if (totalItemsCard) totalItemsCard.textContent = totalItemsText;

        if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
        if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages || totalCount === 0;

        // Se usar cards/grid
        const prevPageBtnCard = document.getElementById('prevPageBtnCard');
        const nextPageBtnCard = document.getElementById('nextPageBtnCard');
        if (prevPageBtnCard) prevPageBtnCard.disabled = currentPage === 1;
        if (nextPageBtnCard) nextPageBtnCard.disabled = currentPage === totalPages || totalCount === 0;
    };
    
    const renderTable = (logs) => {
        tableBody.innerHTML = '';
        if (logs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum produto encontrado com os filtros aplicados.</td></tr>';
            return;
        }

        logs.forEach(log => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${log.nome_produto}</td>
                <td>${log.supermarkets?.nome || 'N/A'} - ${log.supermarkets?.cidade || ''}</td>
                <td>${log.gtin || 'N/A'}</td>
                <td>${formatarPreco(log.preco_atual)}</td>
                <td>${formatarData(log.data_ultima_venda)}</td>
                <td>
                    <button class="btn-icon" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon danger" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            `;
        });
    };

    const renderGrid = (logs) => {
        productsGrid.innerHTML = '';
        if (logs.length === 0) {
            productsGrid.innerHTML = '<p style="text-align: center; padding: 20px;">Nenhum produto encontrado com os filtros aplicados.</p>';
            return;
        }
        
        logs.forEach(log => {
            productsGrid.innerHTML += `
                <div class="product-card">
                    <div class="card-header">
                        <div class="card-title">${log.nome_produto}</div>
                        <span class="card-price">${formatarPreco(log.preco_atual)}</span>
                    </div>
                    <div class="card-info">
                        <strong>Supermercado:</strong> ${log.supermarkets?.nome || 'N/A'} - ${log.supermarkets?.cidade || ''}
                    </div>
                    <div class="card-info">
                        <strong>GTIN:</strong> ${log.gtin || 'N/A'}
                    </div>
                    <div class="card-info">
                        <strong>Última Venda:</strong> ${formatarData(log.data_ultima_venda)}
                    </div>
                    <div class="card-actions">
                        <button class="btn small outline" title="Ver Detalhes"><i class="fas fa-eye"></i> Detalhes</button>
                        <button class="btn small danger" title="Excluir"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        });
    };

    /**
     * Função central para buscar dados com filtros e renderizar.
     * @param {number} page - A página a ser buscada.
     * @param {object} filters - Objeto contendo os filtros (search, supermarketId, date, priceMax).
     */
    const fetchLogs = async (page = 1, filters = {}) => {
        currentPage = page;
        const offset = (currentPage - 1) * pageSize;

        if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;"><div class="loader"></div></td></tr>`;
        if (productsGrid) productsGrid.innerHTML = '<div class="loader-container"><div class="loader"></div><p>Carregando produtos...</p></div>';

        try {
            const session = await getSession();
            if (!session) { 
                // A função routeGuard (em auth.js) deve lidar com o redirecionamento.
                if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Usuário não autenticado.</td></tr>';
                return;
            }

            // Inicia a query com base nos filtros (assumindo Supabase JS v2)
            let query = supabase.from('logs')
                .select(`
                    id, 
                    nome_produto, 
                    gtin, 
                    preco_atual, 
                    data_ultima_venda, 
                    supermarkets:id_supermercado (nome, cidade)
                `, { count: 'exact' });

            // 1. Aplicar Filtros (vindos do product-filters.js)
            if (filters.search) {
                // Busca em nome OU GTIN
                query = query.or(`nome_produto.ilike.%${filters.search}%,gtin.ilike.%${filters.search}%`);
            }
            if (filters.supermarketId) {
                query = query.eq('id_supermercado', filters.supermarketId);
            }
            if (filters.date) {
                query = query.gte('data_ultima_venda', filters.date); 
            }
            if (filters.priceMax) {
                query = query.lte('preco_atual', filters.priceMax);
            }

            // 2. Aplicar Ordenação
            query = query.order(currentSort.column, { ascending: currentSort.direction === 'asc' });

            // 3. Aplicar Paginação
            query = query.range(offset, offset + pageSize - 1);

            const { data, error, count } = await query;

            if (error) { throw error; }

            totalCount = count;
            const totalPages = Math.ceil(totalCount / pageSize);

            if (tableBody) renderTable(data);
            if (productsGrid) renderGrid(data);
            updatePagination(data, totalPages);

        } catch (error) {
            console.error('Erro ao buscar logs:', error.message);
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--error);">Erro ao carregar dados: ${error.message}</td></tr>`;
            if (productsGrid) productsGrid.innerHTML = `<p style="text-align: center; color: var(--error);">Erro ao carregar dados: ${error.message}</p>`;
        }
    };

    // --- FUNÇÕES PÚBLICAS E LÓGICA DE EVENTOS PRINCIPAIS ---

    /**
     * FUNÇÃO PÚBLICA: Usada pelo product-filters.js para acionar uma nova busca.
     * @param {object} newFilters - O novo conjunto de filtros a aplicar.
     */
    const refreshData = (newFilters) => {
        currentFilters = newFilters;
        currentPage = 1; // Reinicia a página ao mudar o filtro
        fetchLogs(currentPage, currentFilters);
    };

    // Lógica de Paginação (Mantida aqui pois afeta o estado interno de currentPage/pageSize)
    const handlePageChange = (direction) => {
        const totalPages = Math.ceil(totalCount / pageSize);
        let targetPage = currentPage;

        if (direction === 'next' && currentPage < totalPages) {
            targetPage++;
        } else if (direction === 'prev' && currentPage > 1) {
            targetPage--;
        }
        
        if (targetPage !== currentPage) {
             fetchLogs(targetPage, currentFilters);
        }
    };
    
    const handlePageSizeChange = (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1;
        fetchLogs(currentPage, currentFilters);
    };
    
    // Lógica de Ordenação (Mantida aqui pois afeta o estado interno de currentSort)
    const handleSort = (e) => {
        const header = e.currentTarget;
        const column = header.dataset.sort;
        let direction = 'desc';

        if (currentSort.column === column) {
            direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
        }

        currentSort = { column, direction };
        
        // Atualiza indicadores visuais (Se existirem)
        document.querySelectorAll('.sortable-header').forEach(h => {
            const ind = h.querySelector('.sort-indicator');
            if (ind) {
                ind.className = 'fas fa-sort sort-indicator';
            }
        });

        const indicator = header.querySelector('.sort-indicator');
        if (indicator) {
            indicator.className = `fas fa-sort-${direction === 'asc' ? 'up' : 'down'} sort-indicator`;
        }

        fetchLogs(currentPage, currentFilters);
    }

    // Inicialização do DOM
    document.addEventListener('DOMContentLoaded', () => {
        // Mapeamento dos elementos DOM
        tableBody = document.querySelector('#productsTable tbody');
        productsGrid = document.getElementById('productsGrid');
        prevPageBtn = document.getElementById('prevPageBtn');
        nextPageBtn = document.getElementById('nextPageBtn');
        itemsPerPageEl = document.getElementById('itemsPerPage');
        pageInfo = document.getElementById('pageInfo');
        pageInfoCard = document.getElementById('pageInfoCard');
        totalItems = document.getElementById('totalItems');
        totalItemsCard = document.getElementById('totalItemsCard');

        // Paginação (Mantém a lógica e os listeners aqui)
        if (prevPageBtn) prevPageBtn.addEventListener('click', () => handlePageChange('prev'));
        if (nextPageBtn) nextPageBtn.addEventListener('click', () => handlePageChange('next'));
        if (itemsPerPageEl) itemsPerPageEl.addEventListener('change', handlePageSizeChange);

        // Ordenação
        document.querySelectorAll('.sortable-header').forEach(header => {
            header.addEventListener('click', handleSort);
        });

        // Define o tamanho inicial da página
        if (itemsPerPageEl) pageSize = parseInt(itemsPerPageEl.value);
        
        // A primeira chamada para fetchLogs será feita pelo product-filters.js
        // após carregar os supermercados para garantir que a lógica esteja completa.
    });
    
    // Retorna a interface pública
    return {
        refreshData: refreshData,
        // (Opcional, se precisar de mais informações no console)
        getCurrentFilters: () => currentFilters 
    };
})();
