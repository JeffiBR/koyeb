// product-filters.js: Gerenciamento dos inputs e lógica de filtros

document.addEventListener('DOMContentLoaded', () => {
    // Verifica se a interface de comunicação do script principal está disponível
    if (typeof productLogApp === 'undefined' || typeof getSession === 'undefined') {
        console.error("Erro: productLogApp ou getSession não estão definidos. Verifique se product-log.js e auth.js foram carregados primeiro no HTML.");
        // Se a aplicação core não está carregada, não há o que fazer.
        return;
    }

    // Elementos de Filtro
    const searchInput = document.getElementById('searchInput');
    const supermarketFilter = document.getElementById('supermarketFilter');
    const dateFilter = document.getElementById('dateFilter');
    const priceRange = document.getElementById('priceRange');
    const clearPriceBtn = document.getElementById('clearPriceBtn');

    let searchTimeout;

    // Função para coletar todos os filtros e chamar a busca principal
    const applyFilters = () => {
        const filters = {
            // Trim() para remover espaços em branco
            // Os wildcards (%) e o toLowerCase() são tratados diretamente na query Supabase do product-log.js com .ilike
            search: searchInput ? searchInput.value.trim() : null,
            supermarketId: supermarketFilter ? supermarketFilter.value || null : null,
            date: dateFilter ? dateFilter.value || null : null,
            // Converte para número ou null se o campo estiver vazio. Usa Number() para garantir formato.
            priceMax: priceRange && priceRange.value ? Number(priceRange.value) : null
        };

        // Chama a função pública do product-log.js para iniciar a busca com os novos filtros
        productLogApp.refreshData(filters);
    };
    
    // --- LÓGICA DE PREENCHIMENTO DO FILTRO DE SUPERMERCADOS ---
    const populateSupermarketFilter = async () => {
        if (!supermarketFilter) return;

        try {
            const session = await getSession();
            if (!session) return;
            
            // Simulação de chamada à API de supermercados
            // ATENÇÃO: Se você usa Supabase diretamente, a query seria diferente.
            // Aqui, estamos mantendo a estrutura original de chamada /api/supermarkets.
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
            } else {
                console.error('Falha ao carregar supermercados:', response.statusText);
            }
        } catch (error) {
            console.error('Erro ao carregar supermercados:', error);
        }
    };

    // --- EVENT LISTENERS (AGORA NO SCRIPT DE FILTROS) ---
    
    // 1. Pesquisa por Input (com debounce para performance)
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                applyFilters();
            }, 300); // Aguarda 300ms após a digitação
        });
    }

    // 2. Filtros de Select e Date (aplicação imediata)
    if (supermarketFilter) supermarketFilter.addEventListener('change', applyFilters);
    if (dateFilter) dateFilter.addEventListener('change', applyFilters);
    
    // 3. Preço Máximo (com debounce)
    if (priceRange) {
        priceRange.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                applyFilters();
            }, 500); // 500ms de debounce para input numérico
        });
    }
    
    // 4. Botão de Limpar Preço
    if (clearPriceBtn && priceRange) {
        clearPriceBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            priceRange.value = ''; // Limpa o input
            applyFilters();       // Aplica os filtros novamente
        });
    }

    // --- INICIALIZAÇÃO ---
    
    // 1. Carrega os supermercados
    populateSupermarketFilter().then(() => {
        // 2. Após carregar os filtros, faz a primeira busca com os filtros padrão (vazios)
        // Isso carrega os dados iniciais da tabela/grid.
        applyFilters(); 
    });
});
