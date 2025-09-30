// dashboard-enhanced.js
document.addEventListener('DOMContentLoaded', () => {
    // Elementos da UI
    const elements = {
        marketFilters: document.getElementById('marketFilters'),
        startDate: document.getElementById('startDate'),
        endDate: document.getElementById('endDate'),
        applyFiltersBtn: document.getElementById('applyFiltersBtn'),
        categoryFilters: document.querySelector('.category-filters'),
        summaryCards: {
            markets: document.getElementById('total-mercados'),
            products: document.getElementById('total-produtos'),
            collections: document.getElementById('total-coletas'),
            lastCollection: document.getElementById('ultima-coleta')
        }
    };

    // Variáveis globais
    let chartInstances = {};
    let currentData = {
        topProducts: [],
        topMarkets: [],
        bargains: []
    };

    // Categorias otimizadas para busca
    const CATEGORIES = {
        'Todos': { keywords: [] },
        'Carnes': {
            keywords: ['picanha', 'alcatra', 'contra file', 'file', 'coxao', 'maminha', 'fraldinha', 'musculo', 'acem', 'paleta', 'costela', 'hamburguer', 'frango', 'coxa', 'sobrecoxa', 'asa', 'peito', 'linguica', 'bisteca', 'pernil', 'lombo', 'bovino', 'suino', 'carne'],
            unit: 'KG'
        },
        'Arroz': {
            keywords: ['arroz'],
            unit: '1KG'
        },
        'Feijão': {
            keywords: ['feijao', 'feijão'],
            unit: '1KG'
        },
        'Açúcar': {
            keywords: ['açucar', 'acucar', 'açúcar'],
            unit: '1KG'
        },
        'Farinha': {
            keywords: ['farinha'],
            unit: '1KG'
        },
        'Hortifruti': {
            keywords: ['batata', 'cebola', 'tomate', 'banana', 'maca', 'maçã', 'laranja', 'alho', 'cenoura', 'alface', 'verdura', 'legume', 'fruta', 'ovo', 'limao', 'limão', 'mamao', 'mamão', 'pimentao', 'pimentão', 'abobora', 'abóbora'],
            unit: 'KG'
        },
        'Laticínios': {
            keywords: ['leite', 'queijo', 'mussarela', 'muçarela', 'prato', 'minas', 'requeijao', 'requeijão', 'iogurte', 'manteiga', 'margarina', 'creme de leite', 'leite condensado']
        },
        'Padaria': {
            keywords: ['pao', 'pão', 'bisnaguinha', 'torrada', 'bolo', 'biscoito', 'bolacha']
        },
        'Bebidas': {
            keywords: ['refrigerante', 'coca cola', 'guarana', 'suco', 'agua', 'água', 'cerveja', 'vinho']
        }
    };

    // Funções de formatação
    const format = {
        date: (date) => date.toISOString().split('T')[0],
        brl: (value) => typeof value === 'number' ? `R$ ${value.toFixed(2).replace('.', ',')}` : 'N/A',
        dateStr: (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('pt-BR') : 'N/A',
        marketName: (name) => name.length > 20 ? name.substring(0, 20) + '...' : name
    };

    // Renderização dos cartões de resumo
    const renderSummary = (data) => {
        const icons = {
            markets: '<i class="fas fa-store"></i>',
            products: '<i class="fas fa-boxes"></i>',
            collections: '<i class="fas fa-shopping-cart"></i>',
            lastCollection: '<i class="fas fa-clock"></i>'
        };

        elements.summaryCards.markets.closest('.card').innerHTML = `
            <div class="card-icon">${icons.markets}</div>
            <div class="card-content">
                <h3>Mercados</h3>
                <p>${data.total_mercados || 0}</p>
            </div>
        `;

        elements.summaryCards.products.closest('.card').innerHTML = `
            <div class="card-icon">${icons.products}</div>
            <div class="card-content">
                <h3>Produtos Coletados</h3>
                <p>${data.total_produtos || 0}</p>
            </div>
        `;

        elements.summaryCards.collections.closest('.card').innerHTML = `
            <div class="card-icon">${icons.collections}</div>
            <div class="card-content">
                <h3>Coletas Realizadas</h3>
                <p>${data.total_coletas || 0}</p>
            </div>
        `;

        elements.summaryCards.lastCollection.closest('.card').innerHTML = `
            <div class="card-icon">${icons.lastCollection}</div>
            <div class="card-content">
                <h3>Última Coleta</h3>
                <p>${format.dateStr(data.ultima_coleta) || 'Nenhuma'}</p>
            </div>
        `;

        // Adicionar animação
        document.querySelectorAll('.summary-cards .card').forEach(card => {
            card.classList.add('fade-in');
        });
    };

    // Renderização de gráficos
    const renderChart = (canvasId, data, label, type = 'bar') => {
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');
        const colors = [
            '#4f46e5', '#7c3aed', '#06d6a0', '#f59e0b', 
            '#ef4444', '#8b5cf6', '#10b981', '#f97316'
        ];

        chartInstances[canvasId] = new Chart(ctx, {
            type: type,
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: label,
                    data: data.map(d => d.value),
                    backgroundColor: colors,
                    borderColor: type === 'line' ? colors[0] : undefined,
                    borderWidth: type === 'line' ? 3 : 1,
                    fill: type === 'line'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: type !== 'pie'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                indexAxis: (type === 'bar') ? 'y' : 'x',
                scales: type === 'bar' ? {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                } : {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    };

    // Renderização dos top charts
    const renderTopCharts = (data) => {
        currentData.topProducts = (data.top_products || [])
            .slice(0, 10)
            .map(item => ({ 
                label: item.term.length > 20 ? item.term.substring(0, 20) + '...' : item.term, 
                value: item.search_count 
            }));

        currentData.topMarkets = (data.top_markets || [])
            .slice(0, 10)
            .map(item => ({ 
                label: format.marketName(item.market_name), 
                value: item.search_count 
            }));

        renderChart('topProductsChart', currentData.topProducts, '# de Buscas', 'bar');
        renderChart('topMarketsChart', currentData.topMarkets, '# de Seleções', 'bar');
    };

    // Renderização da tabela de caça-ofertas
    const renderBargainsTable = (categoryKey) => {
        const tableBody = document.querySelector('#bargainsTable tbody');
        let filteredData = currentData.bargains;

        if (categoryKey !== 'Todos') {
            const categoryRules = CATEGORIES[categoryKey];
            const keywords = categoryRules.keywords;
            filteredData = currentData.bargains.filter(item => {
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
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 2rem;">
                        <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                        <p>Nenhuma oferta encontrada para esta categoria.</p>
                    </td>
                </tr>
            `;
            return;
        }

        filteredData.slice(0, 30).forEach(item => {
            const row = document.createElement('tr');
            row.classList.add('fade-in');
            row.innerHTML = `
                <td>${item.nome_produto}</td>
                <td><span class="price-badge">${format.brl(item.preco_produto)}</span></td>
                <td>${item.nome_supermercado}</td>
                <td>${format.dateStr(item.data_ultima_venda)}</td>
            `;
            tableBody.appendChild(row);
        });
    };

    // Busca principal dos dados
    const fetchDashboardData = async () => {
        const selectedCnpjs = Array.from(document.querySelectorAll('#marketFilters input:checked'))
            .map(cb => cb.value);
        const startDate = elements.startDate.value;
        const endDate = elements.endDate.value;

        if (!startDate || !endDate) {
            alert('Por favor, selecione um período de datas.');
            return;
        }

        let query = `start_date=${startDate}&end_date=${endDate}`;
        if (selectedCnpjs.length > 0) {
            query += `&${selectedCnpjs.map(cnpj => `cnpjs=${cnpj}`).join('&')}`;
        }

        try {
            elements.applyFiltersBtn.disabled = true;
            elements.applyFiltersBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';

            const [summary, stats, bargains] = await Promise.all([
                authenticatedFetch(`/api/dashboard/summary?${query}`).then(res => res.json()),
                authenticatedFetch(`/api/dashboard/stats?${query}`).then(res => res.json()),
                authenticatedFetch(`/api/dashboard/bargains?${query}`).then(res => res.json())
            ]);

            renderSummary(summary);
            renderTopCharts(stats);
            currentData.bargains = bargains;
            renderBargainsTable('Todos');

            // Ativar filtro "Todos"
            document.querySelector('.category-filters button[data-category="Todos"]').classList.add('active');

        } catch (error) {
            console.error("Erro ao carregar dados do dashboard:", error);
            alert("Não foi possível carregar os dados do dashboard.");
        } finally {
            elements.applyFiltersBtn.disabled = false;
            elements.applyFiltersBtn.innerHTML = '<i class="fas fa-filter"></i> Aplicar Filtros';
        }
    };

    // Inicialização
    const initialize = async () => {
        // Configurar datas padrão (últimos 7 dias)
        const today = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);
        
        elements.endDate.value = format.date(today);
        elements.startDate.value = format.date(sevenDaysAgo);

        // Carregar mercados
        try {
            const markets = await fetch('/api/supermarkets/public').then(res => res.json());
            elements.marketFilters.innerHTML = markets
                .map(m => `
                    <label>
                        <input type="checkbox" name="market" value="${m.cnpj}" checked>
                        <span>${m.nome}</span>
                    </label>
                `).join('');
        } catch (error) {
            console.error("Erro ao carregar mercados:", error);
        }

        // Configurar filtros de categoria
        elements.categoryFilters.innerHTML = Object.keys(CATEGORIES)
            .map(cat => `<button data-category="${cat}">${cat}</button>`)
            .join('');

        // Configurar toggles dos gráficos
        document.getElementById('toggles-products').innerHTML = `
            <button data-chart="topProductsChart" data-type="bar" class="active">Barras</button>
            <button data-chart="topProductsChart" data-type="line">Linhas</button>
            <button data-chart="topProductsChart" data-type="pie">Pizza</button>
        `;

        document.getElementById('toggles-markets').innerHTML = `
            <button data-chart="topMarketsChart" data-type="bar" class="active">Barras</button>
            <button data-chart="topMarketsChart" data-type="pie">Pizza</button>
        `;

        // Event listeners
        elements.applyFiltersBtn.addEventListener('click', fetchDashboardData);

        // Toggles de gráficos
        document.querySelectorAll('.chart-toggles').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') {
                    const chartId = e.target.dataset.chart;
                    const type = e.target.dataset.type;
                    
                    // Ativar botão clicado
                    e.target.parentElement.querySelectorAll('button').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    e.target.classList.add('active');
                    
                    if (chartId === 'topProductsChart') {
                        renderChart('topProductsChart', currentData.topProducts, '# de Buscas', type);
                    } else if (chartId === 'topMarketsChart') {
                        renderChart('topMarketsChart', currentData.topMarkets, '# de Seleções', type);
                    }
                }
            });
        });

        // Filtros de categoria
        elements.categoryFilters.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                const category = e.target.dataset.category;
                
                // Ativar botão clicado
                e.target.parentElement.querySelectorAll('button').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.target.classList.add('active');
                
                renderBargainsTable(category);
            }
        });

        // Carregar dados iniciais
        fetchDashboardData();
    };

    initialize();
});
