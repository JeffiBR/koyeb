document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI ---
    const marketFiltersContainer = document.getElementById('marketFilters');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    const categoryFiltersContainer = document.querySelector('.category-filters');

    // --- Variáveis Globais ---
    let chartInstances = {};
    let topProductsData = [];
    let topMarketsData = [];
    let allBargainsData = [];
    
    // --- CATEGORIAS PARA O CAÇA-OFERTAS ---
    const CATEGORIES = {
        'Todos': { keywords: [] },
        'Carnes': {
            keywords: ['picanha', 'alcatra', 'contra filé', 'coxão', 'maminha', 'fraldinha', 'músculo', 'acém', 'paleta', 'costela', 'hambúrguer', 'frango', 'coxa', 'sobrecoxa', 'asa', 'peito', 'linguiça', 'bisteca', 'pernil', 'lombo', 'bovino', 'suíno', 'carne'],
            unit: 'KG'
        },
        'Laticínios': {
            keywords: ['leite', 'queijo', 'mussarela', 'muçarela', 'prato', 'minas', 'requeijão', 'iogurte', 'manteiga', 'margarina', 'creme de leite', 'leite condensado']
        },
        'Mercearia': {
            keywords: ['arroz', 'feijão', 'macarrão', 'farinha', 'fubá', 'aveia', 'granola', 'cereal', 'milho', 'ervilha', 'lentilha', 'açúcar', 'adoçante', 'sal', 'óleo', 'azeite', 'vinagre', 'café']
        },
        'Hortifrúti': {
            keywords: ['batata', 'cebola', 'tomate', 'banana', 'maçã', 'laranja', 'alho', 'cenoura', 'alface', 'verdura', 'legume', 'fruta', 'ovo', 'limão', 'mamão', 'pimentão']
        },
        'Padaria': {
            keywords: ['pão', 'pao', 'bisnaguinha', 'torrada', 'bolo', 'biscoito', 'bolacha']
        },
        'Bebidas': {
            keywords: ['refrigerante', 'coca cola', 'guaraná', 'suco', 'água', 'agua', 'cerveja', 'vinho']
        }
    };

    // --- FUNÇÕES DE FORMATAÇÃO ---
    const formatDate = (date) => date.toISOString().split('T')[0];
    const formatBRL = (value) => typeof value === 'number' ? `R$ ${value.toFixed(2).replace('.', ',')}` : 'N/A';
    const formatDateStr = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('pt-BR') : 'N/A';

    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    const renderSummary = (data) => {
        document.getElementById('total-mercados').textContent = data.total_mercados || 0;
        document.getElementById('total-produtos').textContent = data.total_produtos || 0;
        document.getElementById('total-coletas').textContent = data.total_coletas || 0;
        document.getElementById('ultima-coleta').textContent = formatDateStr(data.ultima_coleta) || 'Nenhuma';
    };

    const renderChart = (canvasId, data, label, type) => {
        if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
        const ctx = document.getElementById(canvasId).getContext('2d');
        chartInstances[canvasId] = new Chart(ctx, {
            type: type,
            data: { labels: data.map(d => d.label), datasets: [{ label, data: data.map(d => d.value), backgroundColor: ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#7f8c8d'] }] },
            options: { responsive: true, plugins: { legend: { display: type !== 'pie' } }, indexAxis: (type === 'bar') ? 'y' : 'x' }
        });
    };
    
    const renderTopCharts = (data) => {
        topProductsData = (data.top_products || []).map(item => ({ label: item.term, value: item.search_count }));
        topMarketsData = (data.top_markets || []).map(item => ({ label: item.market_name, value: item.search_count }));
        renderChart('topProductsChart', topProductsData.reverse(), '# de Buscas', 'bar');
        renderChart('topMarketsChart', topMarketsData.reverse(), '# de Seleções', 'bar');
    };

    const renderBargainsTable = (categoryKey) => {
        const tableBody = document.querySelector('#bargainsTable tbody');
        let filteredData = allBargainsData;

        if (categoryKey !== 'Todos') {
            const categoryRules = CATEGORIES[categoryKey];
            const keywords = categoryRules.keywords;
            filteredData = allBargainsData.filter(item => {
                const productNameLower = item.nome_produto.toLowerCase();
                const nameMatch = keywords.some(keyword => productNameLower.includes(keyword));
                if (categoryRules.unit) {
                    return nameMatch && item.tipo_unidade === categoryRules.unit;
                }
                return nameMatch;
            });
        }
        
        tableBody.innerHTML = '';
        if (filteredData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhuma oferta encontrada.</td></tr>'; return;
        }
        filteredData.slice(0, 30).forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${item.nome_produto}</td><td><strong>${formatBRL(item.preco_produto)}</strong></td><td>${item.nome_supermercado}</td><td>${formatDateStr(item.data_ultima_venda)}</td>`;
            tableBody.appendChild(row);
        });
    };

    // --- FUNÇÃO PRINCIPAL DE BUSCA ---
    const fetchDashboardData = async () => {
        const selectedCnpjs = Array.from(document.querySelectorAll('#marketFilters input:checked')).map(cb => cb.value);
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        if (!startDate || !endDate) { alert('Por favor, selecione um período de datas.'); return; }

        let query = `start_date=${startDate}&end_date=${endDate}`;
        if (selectedCnpjs.length > 0) { query += `&${selectedCnpjs.map(cnpj => `cnpjs=${cnpj}`).join('&')}`; }

        try {
            applyFiltersBtn.disabled = true;
            applyFiltersBtn.textContent = 'Carregando...';

            // Usa Promise.all para fazer todas as chamadas em paralelo
            const [summary, stats, bargains] = await Promise.all([
                authenticatedFetch(`/api/dashboard/summary?${query}`).then(res => res.json()),
                authenticatedFetch(`/api/dashboard/stats?${query}`).then(res => res.json()),
                authenticatedFetch(`/api/dashboard/bargains?${query}`).then(res => res.json())
            ]);

            renderSummary(summary);
            renderTopCharts(stats);
            allBargainsData = bargains;
            renderBargainsTable('Todos');
            document.querySelector('.category-filters button[data-category="Todos"]').classList.add('active');

        } catch (error) {
            console.error("Erro ao carregar dados do dashboard:", error);
            alert("Não foi possível carregar os dados do dashboard.");
        } finally {
            applyFiltersBtn.disabled = false;
            applyFiltersBtn.textContent = 'Aplicar Filtros';
        }
    };

    // --- SETUP INICIAL E EVENT LISTENERS ---
    const initialize = async () => {
        const today = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);
        endDateInput.value = formatDate(today);
        startDateInput.value = formatDate(sevenDaysAgo);

        // Carrega os filtros de mercado usando o endpoint público
        const markets = await fetch('/api/supermarkets/public').then(res => res.json());
        marketFiltersContainer.innerHTML = markets.map(m => `<label><input type="checkbox" name="market" value="${m.cnpj}">${m.nome}</label>`).join('');

        categoryFiltersContainer.innerHTML = Object.keys(CATEGORIES).map(cat => `<button data-category="${cat}">${cat}</button>`).join('');
        document.getElementById('toggles-products').innerHTML = '<button data-chart="topProductsChart" data-type="bar">Barra</button><button data-chart="topProductsChart" data-type="pie">Pizza</button><button data-chart="topProductsChart" data-type="line">Linha</button>';
        document.getElementById('toggles-markets').innerHTML = '<button data-chart="topMarketsChart" data-type="bar">Barra</button><button data-chart="topMarketsChart" data-type="pie">Pizza</button>';
        
        applyFiltersBtn.addEventListener('click', fetchDashboardData);
        document.querySelectorAll('.chart-toggles').forEach(el => el.addEventListener('click', (e) => {
            if(e.target.tagName === 'BUTTON') {
                const chartId = e.target.dataset.chart;
                const type = e.target.dataset.type;
                if(chartId === 'topProductsChart') renderChart('topProductsChart', topProductsData, '# de Buscas', type);
                if(chartId === 'topMarketsChart') renderChart('topMarketsChart', topMarketsData, '# de Seleções', type);
            }
        }));
        categoryFiltersContainer.addEventListener('click', (e) => {
            if(e.target.tagName === 'BUTTON') {
                const category = e.target.dataset.category;
                document.querySelectorAll('.category-filters button').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                renderBargainsTable(category);
            }
        });

        // Carrega os dados iniciais do dashboard
        fetchDashboardData();
    };

    initialize();
});
