// dashboard.js - Dashboard Analítico Completo
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
    let categoryFilter;

    // --- CATEGORIAS PARA O CAÇA-OFERTAS ---
    const CATEGORIES = {
        'Todos': { 
            keywords: [],
            filter: (item) => true
        },
        'Carnes KG': {
            keywords: ['picanha', 'alcatra', 'contra filé', 'coxão', 'maminha', 'fraldinha', 'músculo', 'acém', 'paleta', 'costela', 'hambúrguer', 'frango', 'coxa', 'sobrecoxa', 'asa', 'peito', 'linguiça', 'bisteca', 'pernil', 'lombo', 'bovino', 'suíno', 'carne'],
            filter: (item) => {
                const productNameLower = item.nome_produto.toLowerCase();
                const hasKeyword = CATEGORIES['Carnes KG'].keywords.some(keyword => 
                    productNameLower.includes(keyword)
                );
                const hasKg = item.tipo_unidade === 'KG' || 
                             item.nome_produto.toLowerCase().includes('kg') ||
                             item.nome_produto.toLowerCase().includes('kilo') ||
                             item.nome_produto.toLowerCase().includes('quilo');
                
                return hasKeyword && hasKg;
            }
        },
        'Hortifrúti': {
            keywords: ['batata', 'cebola', 'tomate', 'banana', 'maçã', 'laranja', 'alho', 'cenoura', 'alface', 'verdura', 'legume', 'fruta', 'ovo', 'limão', 'mamão', 'pimentão', 'abobora', 'abóbora', 'berinjela', 'chuchu', 'couve', 'repolho', 'brócolis', 'couve-flor'],
            filter: (item) => {
                const productNameLower = item.nome_produto.toLowerCase();
                return CATEGORIES['Hortifrúti'].keywords.some(keyword => 
                    productNameLower.includes(keyword)
                );
            }
        },
        'Laticínios': {
            keywords: ['leite', 'queijo', 'mussarela', 'muçarela', 'prato', 'minas', 'requeijão', 'iogurte', 'manteiga', 'margarina', 'creme de leite', 'leite condensado', 'iogurte', 'coalhada', 'nata'],
            filter: (item) => {
                const productNameLower = item.nome_produto.toLowerCase();
                return CATEGORIES['Laticínios'].keywords.some(keyword => 
                    productNameLower.includes(keyword)
                );
            }
        },
        'Mercearia': {
            keywords: ['arroz', 'feijão', 'macarrão', 'farinha', 'fubá', 'aveia', 'granola', 'cereal', 'milho', 'ervilha', 'lentilha', 'açúcar', 'adoçante', 'sal', 'óleo', 'azeite', 'vinagre', 'café', 'molho', 'extrato', 'achocolatado'],
            filter: (item) => {
                const productNameLower = item.nome_produto.toLowerCase();
                return CATEGORIES['Mercearia'].keywords.some(keyword => 
                    productNameLower.includes(keyword)
                );
            }
        },
        'Padaria': {
            keywords: ['pão', 'pao', 'bisnaguinha', 'torrada', 'bolo', 'biscoito', 'bolacha', 'rosca', 'croissant', 'baguete', 'frances', 'doce', 'rosca'],
            filter: (item) => {
                const productNameLower = item.nome_produto.toLowerCase();
                return CATEGORIES['Padaria'].keywords.some(keyword => 
                    productNameLower.includes(keyword)
                );
            }
        },
        'Bebidas': {
            keywords: ['refrigerante', 'coca cola', 'guaraná', 'suco', 'água', 'agua', 'cerveja', 'vinho', 'whisky', 'vodka', 'energético', 'isotônico'],
            filter: (item) => {
                const productNameLower = item.nome_produto.toLowerCase();
                return CATEGORIES['Bebidas'].keywords.some(keyword => 
                    productNameLower.includes(keyword)
                );
            }
        },
        'Limpeza': {
            keywords: ['sabão', 'sabao', 'detergente', 'amaciante', 'desinfetante', 'água sanitária', 'alvejante', 'limpa vidro', 'lustra móvel', 'inseticida', 'multiuso'],
            filter: (item) => {
                const productNameLower = item.nome_produto.toLowerCase();
                return CATEGORIES['Limpeza'].keywords.some(keyword => 
                    productNameLower.includes(keyword)
                );
            }
        },
        'Higiene': {
            keywords: ['shampoo', 'condicionador', 'sabonete', 'pasta de dente', 'creme dental', 'escova', 'papel higiênico', 'toalha', 'desodorante', 'protetor', 'absorvente'],
            filter: (item) => {
                const productNameLower = item.nome_produto.toLowerCase();
                return CATEGORIES['Higiene'].keywords.some(keyword => 
                    productNameLower.includes(keyword)
                );
            }
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
        
        // Configurações de cores baseadas no tema
        const isLightMode = document.body.classList.contains('light-mode');
        const textColor = isLightMode ? '#071028' : '#e6eef7';
        const gridColor = isLightMode ? 'rgba(230, 233, 239, 0.5)' : 'rgba(255, 255, 255, 0.1)';
        
        // Cores para os gráficos
        const backgroundColors = [
            'rgba(79, 70, 229, 0.8)',
            'rgba(124, 58, 237, 0.8)',
            'rgba(22, 163, 74, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(239, 68, 68, 0.8)',
            'rgba(14, 165, 233, 0.8)',
            'rgba(139, 92, 246, 0.8)',
            'rgba(20, 184, 166, 0.8)',
            'rgba(249, 115, 22, 0.8)',
            'rgba(236, 72, 153, 0.8)'
        ];

        const borderColors = backgroundColors.map(color => color.replace('0.8', '1'));

        chartInstances[canvasId] = new Chart(ctx, {
            type: type,
            data: { 
                labels: data.map(d => d.label), 
                datasets: [{ 
                    label, 
                    data: data.map(d => d.value), 
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 2
                }] 
            },
            options: { 
                responsive: true, 
                plugins: { 
                    legend: { 
                        display: type !== 'pie',
                        labels: {
                            color: textColor
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: type === 'pie' ? undefined : {
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                },
                indexAxis: (type === 'bar') ? 'y' : 'x'
            }
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
            if (categoryRules && categoryRules.filter) {
                filteredData = allBargainsData.filter(categoryRules.filter);
            } else {
                // Fallback para o método antigo de keywords
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
        }
        
        tableBody.innerHTML = '';
        if (filteredData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--muted-dark);">Nenhuma oferta encontrada para esta categoria.</td></tr>';
            return;
        }

        // Ordena por preço (menor primeiro)
        filteredData.sort((a, b) => a.preco_produto - b.preco_produto);
        
        filteredData.slice(0, 50).forEach((item, index) => {
            const row = document.createElement('tr');
            const unitClass = item.tipo_unidade === 'KG' ? 'unit-kg' : 'unit-un';
            
            row.innerHTML = `
                <td>${item.nome_produto}</td>
                <td><strong>${formatBRL(item.preco_produto)}</strong></td>
                <td>${item.nome_supermercado}</td>
                <td>${formatDateStr(item.data_ultima_venda)}</td>
                <td class="${unitClass}">${item.tipo_unidade || 'UN'}</td>
            `;
            
            // Destacar as melhores ofertas
            if (index < 3) {
                row.style.backgroundColor = 'rgba(22, 163, 74, 0.1)';
                row.style.borderLeft = '4px solid var(--success)';
            }
            
            tableBody.appendChild(row);
        });

        // Atualiza contador de resultados
        updateResultsCount(filteredData.length, categoryKey);
    };

    const updateResultsCount = (count, category) => {
        let counterElement = document.getElementById('resultsCounter');
        if (!counterElement) {
            counterElement = document.createElement('div');
            counterElement.id = 'resultsCounter';
            counterElement.style.cssText = 'margin: 1rem 0; padding: 0.75rem; background: var(--input-dark); border-radius: 8px; font-weight: 600;';
            document.querySelector('#bargainsTable').parentNode.insertBefore(counterElement, document.querySelector('#bargainsTable'));
        }

        const isLightMode = document.body.classList.contains('light-mode');
        const textColor = isLightMode ? 'var(--text-light)' : 'var(--text-dark)';
        
        counterElement.innerHTML = `
            <span style="color: ${textColor}">
                Mostrando <strong style="color: var(--primary)">${count}</strong> ofertas 
                ${category !== 'Todos' ? `na categoria <strong style="color: var(--accent)">${category}</strong>` : 'em todas as categorias'}
            </span>
        `;
    };

    // --- FUNÇÃO PRINCIPAL DE BUSCA ---
    const fetchDashboardData = async () => {
        const selectedCnpjs = Array.from(document.querySelectorAll('#marketFilters input:checked')).map(cb => cb.value);
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        
        if (!startDate || !endDate) { 
            showNotification('Por favor, selecione um período de datas.', 'error');
            return; 
        }

        // Validação de datas
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start > end) {
            showNotification('A data inicial não pode ser maior que a data final.', 'error');
            return;
        }

        let query = `start_date=${startDate}&end_date=${endDate}`;
        if (selectedCnpjs.length > 0) { 
            query += `&${selectedCnpjs.map(cnpj => `cnpjs=${cnpj}`).join('&')}`; 
        }

        try {
            applyFiltersBtn.disabled = true;
            applyFiltersBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';

            // Mostrar loading state
            showLoadingState(true);

            // Usa Promise.all para fazer todas as chamadas em paralelo
            const [summary, stats, bargains] = await Promise.all([
                authenticatedFetch(`/api/dashboard/summary?${query}`).then(res => {
                    if (!res.ok) throw new Error('Erro ao carregar resumo');
                    return res.json();
                }),
                authenticatedFetch(`/api/dashboard/stats?${query}`).then(res => {
                    if (!res.ok) throw new Error('Erro ao carregar estatísticas');
                    return res.json();
                }),
                authenticatedFetch(`/api/dashboard/bargains?${query}`).then(res => {
                    if (!res.ok) throw new Error('Erro ao carregar ofertas');
                    return res.json();
                })
            ]);

            renderSummary(summary);
            renderTopCharts(stats);
            allBargainsData = bargains;
            renderBargainsTable('Todos');
            
            // Atualiza botão ativo
            document.querySelector('.category-filters button[data-category="Todos"]')?.classList.add('active');

            showNotification(`Dados carregados com sucesso! ${bargains.length} ofertas encontradas.`, 'success');

        } catch (error) {
            console.error("Erro ao carregar dados do dashboard:", error);
            showNotification("Não foi possível carregar os dados do dashboard.", 'error');
        } finally {
            applyFiltersBtn.disabled = false;
            applyFiltersBtn.innerHTML = '<i class="fas fa-filter"></i> Aplicar Filtros';
            showLoadingState(false);
        }
    };

    // --- FUNÇÕES AUXILIARES DE UI ---
    const showNotification = (message, type = 'info') => {
        // Remove notificação existente
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        // Trigger animation
        setTimeout(() => notification.classList.add('show'), 100);

        // Auto-remove
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    };

    const showLoadingState = (show) => {
        const tables = document.querySelectorAll('table tbody');
        tables.forEach(table => {
            if (show && table.children.length === 0) {
                table.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 2rem;">
                            <div class="loader-container">
                                <div class="loader"></div>
                                <p>Carregando dados...</p>
                            </div>
                        </td>
                    </tr>
                `;
            }
        });
    };

    const renderCategoryFilters = () => {
        const categories = Object.keys(CATEGORIES);
        categoryFiltersContainer.innerHTML = categories.map(cat => 
            `<button class="category-btn" data-category="${cat}">
                ${cat}
                ${cat !== 'Todos' ? `<span class="category-count" id="count-${cat.replace(/\s+/g, '-')}"></span>` : ''}
            </button>`
        ).join('');

        // Adiciona event listeners para os botões de categoria
        categoryFiltersContainer.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.parentElement.tagName === 'BUTTON') {
                const button = e.target.tagName === 'BUTTON' ? e.target : e.target.parentElement;
                const category = button.dataset.category;
                
                // Atualiza botão ativo
                document.querySelectorAll('.category-filters button').forEach(btn => 
                    btn.classList.remove('active')
                );
                button.classList.add('active');
                
                // Renderiza a tabela com a categoria selecionada
                renderBargainsTable(category);
            }
        });
    };

    const updateCategoryCounts = () => {
        Object.keys(CATEGORIES).forEach(category => {
            if (category !== 'Todos') {
                const countElement = document.getElementById(`count-${category.replace(/\s+/g, '-')}`);
                if (countElement) {
                    const filteredData = allBargainsData.filter(CATEGORIES[category].filter);
                    countElement.textContent = `(${filteredData.length})`;
                    
                    // Atualiza cores baseadas na quantidade
                    if (filteredData.length === 0) {
                        countElement.style.color = 'var(--muted-dark)';
                    } else if (filteredData.length > 10) {
                        countElement.style.color = 'var(--success)';
                    } else {
                        countElement.style.color = 'var(--warn)';
                    }
                }
            }
        });
    };

    // --- SETUP INICIAL E EVENT LISTENERS ---
    const initialize = async () => {
        // Configura datas padrão (últimos 7 dias)
        const today = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);
        endDateInput.value = formatDate(today);
        startDateInput.value = formatDate(sevenDaysAgo);

        try {
            // Carrega os filtros de mercado usando o endpoint público
            const marketsResponse = await fetch('/api/supermarkets/public');
            if (!marketsResponse.ok) throw new Error('Erro ao carregar supermercados');
            
            const markets = await marketsResponse.json();
            marketFiltersContainer.innerHTML = markets.map(m => 
                `<label class="market-checkbox">
                    <input type="checkbox" name="market" value="${m.cnpj}">
                    <i class="fas fa-store"></i>
                    ${m.nome}
                </label>`
            ).join('');

            // Renderiza filtros de categoria
            renderCategoryFilters();

            // Configura toggles de gráficos
            document.getElementById('toggles-products').innerHTML = `
                <button data-chart="topProductsChart" data-type="bar" class="active">
                    <i class="fas fa-chart-bar"></i> Barra
                </button>
                <button data-chart="topProductsChart" data-type="pie">
                    <i class="fas fa-chart-pie"></i> Pizza
                </button>
                <button data-chart="topProductsChart" data-type="line">
                    <i class="fas fa-chart-line"></i> Linha
                </button>
            `;
            
            document.getElementById('toggles-markets').innerHTML = `
                <button data-chart="topMarketsChart" data-type="bar" class="active">
                    <i class="fas fa-chart-bar"></i> Barra
                </button>
                <button data-chart="topMarketsChart" data-type="pie">
                    <i class="fas fa-chart-pie"></i> Pizza
                </button>
            `;

            // Event Listeners
            applyFiltersBtn.addEventListener('click', fetchDashboardData);
            
            // Toggles de gráficos
            document.querySelectorAll('.chart-toggles').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.tagName === 'BUTTON') {
                        const chartId = e.target.dataset.chart;
                        const type = e.target.dataset.type;
                        
                        // Atualiza botões ativos
                        e.target.parentElement.querySelectorAll('button').forEach(btn => 
                            btn.classList.remove('active')
                        );
                        e.target.classList.add('active');
                        
                        if (chartId === 'topProductsChart') {
                            renderChart('topProductsChart', topProductsData, '# de Buscas', type);
                        }
                        if (chartId === 'topMarketsChart') {
                            renderChart('topMarketsChart', topMarketsData, '# de Seleções', type);
                        }
                    }
                });
            });

            // Enter key nos inputs de data
            [startDateInput, endDateInput].forEach(input => {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        fetchDashboardData();
                    }
                });
            });

            // Carrega os dados iniciais do dashboard
            await fetchDashboardData();

        } catch (error) {
            console.error('Erro na inicialização:', error);
            showNotification('Erro ao inicializar o dashboard.', 'error');
        }
    };

    // Inicializa o dashboard quando o DOM estiver pronto
    initialize();

    // Atualiza contagens de categoria quando os dados mudam
    setInterval(() => {
        if (allBargainsData.length > 0) {
            updateCategoryCounts();
        }
    }, 2000);
});

// Função auxiliar para buscar dados autenticados
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('supabase.auth.token');
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(url, {
        ...options,
        headers
    });
}
