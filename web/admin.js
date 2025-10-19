document.addEventListener('DOMContentLoaded', async () => {
    // Elementos principais
    const startButton = document.getElementById('startButton');
    const progressContainer = document.getElementById('progress-container');
    const reportContainer = document.getElementById('report-container');
    
    // Elementos de progresso
    const progressBar = document.getElementById('progressBar');
    const progressPercentText = document.getElementById('progressPercentText');
    const etaText = document.getElementById('etaText');
    const progressText = document.getElementById('progressText');
    const itemsFoundText = document.getElementById('itemsFoundText');
    
    // Novos elementos de detalhes
    const currentMarketElement = document.getElementById('currentMarket');
    const currentProductElement = document.getElementById('currentProduct');
    const marketsProcessedElement = document.getElementById('marketsProcessed');
    const totalMarketsElement = document.getElementById('totalMarkets');
    const productsInMarketElement = document.getElementById('productsInMarket');
    const totalProductsElement = document.getElementById('totalProducts');
    const itemsInMarketElement = document.getElementById('itemsInMarket');
    const totalItemsElement = document.getElementById('totalItems');
    const elapsedTimeElement = document.getElementById('elapsedTime');
    
    // Elementos de configuração
    const marketsContainer = document.getElementById('marketsContainer');
    const daysContainer = document.getElementById('daysContainer');
    const selectedMarketsCount = document.getElementById('selectedMarketsCount');
    
    // Elementos do relatório
    const reportTotalItems = document.getElementById('report-total-items');
    const reportDuration = document.getElementById('report-duration');
    const reportMarketsCount = document.getElementById('report-markets-count');
    const reportDays = document.getElementById('report-days');
    const reportTableBody = document.querySelector('#reportTable tbody');
    
    // Elementos de UI
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const themeToggle = document.getElementById('themeToggle');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const logoutBtn = document.getElementById('logoutBtn');

    let pollingInterval;
    let collectionStartTime;

    // ========== FUNÇÕES UTILITÁRIAS ==========

    // Função para mostrar notificações
    const showNotification = (message, type = 'info') => {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : 
                    type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
        notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, type === 'success' ? 3000 : 5000);
    };

    // Formatar segundos para tempo legível
    const formatSeconds = (secs) => {
        if (secs < 0 || secs === null || secs === undefined) return 'Calculando...';
        if (secs === 0) return '0s';
        
        const hours = Math.floor(secs / 3600);
        const minutes = Math.floor((secs % 3600) / 60);
        const seconds = secs % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    };

    // Função para mostrar mensagem quando não há mercados
    function renderNoMarkets() {
        marketsContainer.innerHTML = `
            <div class="no-markets-message">
                <i class="fas fa-store-slash"></i>
                <p>Nenhum mercado cadastrado</p>
                <small>Vá para "Gerenciar Mercados" para adicionar supermercados</small>
            </div>
        `;
        selectedMarketsCount.textContent = '0 mercados selecionados';
    }

    // Função para renderizar mercados com cards
    function renderMarkets(markets) {
        marketsContainer.innerHTML = '';
        
        if (!markets || markets.length === 0) {
            renderNoMarkets();
            return;
        }
        
        markets.forEach(market => {
            const marketElement = document.createElement('div');
            marketElement.className = 'market-card selected';
            marketElement.innerHTML = `
                <div class="market-card-header">
                    <div class="market-info">
                        <div class="market-name">${market.nome}</div>
                        <div class="market-address">${market.endereco || 'Endereço não disponível'}</div>
                        <div class="market-cnpj">${market.cnpj}</div>
                    </div>
                    <div class="market-card-checkbox"></div>
                </div>
            `;
            
            marketElement.addEventListener('click', () => {
                marketElement.classList.toggle('selected');
                updateSelectedMarketsCount();
            });
            
            marketsContainer.appendChild(marketElement);
        });

        updateSelectedMarketsCount();
        console.log(`${markets.length} mercados renderizados`);
    }

    // Configurar seleção de dias
    function setupDaysSelection() {
        const days = [1, 2, 3, 4, 5, 6, 7];
        daysContainer.innerHTML = '';
        
        days.forEach(day => {
            const dayElement = document.createElement('div');
            dayElement.className = 'day-option';
            dayElement.innerHTML = `
                <input type="radio" id="day-${day}" name="days" value="${day}" ${day === 3 ? 'checked' : ''}>
                <label for="day-${day}">${day} ${day === 1 ? 'dia' : 'dias'}</label>
            `;
            daysContainer.appendChild(dayElement);
        });
    }

    // Atualizar contador de mercados selecionados
    function updateSelectedMarketsCount() {
        const selectedMarkets = getSelectedMarkets();
        selectedMarketsCount.textContent = `${selectedMarkets.length} mercados selecionados`;
    }

    // Obter mercados selecionados
    function getSelectedMarkets() {
        const selectedCards = marketsContainer.querySelectorAll('.market-card.selected');
        const selectedMarkets = [];
        
        selectedCards.forEach(card => {
            const cnpjElement = card.querySelector('.market-cnpj');
            if (cnpjElement) {
                selectedMarkets.push(cnpjElement.textContent.trim());
            }
        });
        
        return selectedMarkets;
    }

    // Obter dias selecionados
    function getSelectedDays() {
        const selectedDay = daysContainer.querySelector('input[name="days"]:checked');
        return parseInt(selectedDay.value);
    }

    // ========== FUNÇÕES DE UI ==========

    function toggleTheme() {
        document.body.classList.toggle('light-mode');
        const icon = themeToggle.querySelector('i');
        if (document.body.classList.contains('light-mode')) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }

    function toggleMobileMenu() {
        sidebar.classList.toggle('active');
        if (sidebarOverlay) sidebarOverlay.classList.toggle('show');
    }

    function closeMobileMenu() {
        sidebar.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    }

    function toggleUserDropdown(e) {
        e.stopPropagation();
        userDropdown.classList.toggle('show');
    }

    function closeUserDropdown(e) {
        if (userDropdown && userMenuBtn && 
            !userMenuBtn.contains(e.target) && 
            !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('show');
        }
    }

    function handleLogout(e) {
        e.preventDefault();
        if (typeof window.signOut === 'function') {
            window.signOut();
        } else {
            localStorage.removeItem('supabase.auth.token');
            window.location.href = '/login.html';
        }
    }

    // ========== FUNÇÕES DE PROGRESSO E RELATÓRIO ==========

    // Atualizar interface com dados de status
    const updateUI = (data) => {
        if (data.status === 'RUNNING') {
            showProgressView(data);
        } else {
            showIdleView(data);
        }
    };

    // Função para atualizar o progresso em tempo real
    function updateProgressView(data) {
        if (!data) return;
        
        // Atualizar barra de progresso principal
        const percent = Math.round(data.progressPercent || 0);
        progressBar.style.width = `${percent}%`;
        progressPercentText.textContent = `${percent}%`;
        
        // Atualizar informações de tempo
        etaText.textContent = `Tempo Restante: ${formatSeconds(data.etaSeconds)}`;
        
        // Atualizar informações detalhadas
        currentMarketElement.textContent = data.currentMarket || 'Nenhum';
        currentProductElement.textContent = data.currentProduct || 'Nenhum';
        marketsProcessedElement.textContent = data.marketsProcessed || 0;
        totalMarketsElement.textContent = data.totalMarkets || 0;
        productsInMarketElement.textContent = data.productsProcessedInMarket || 0;
        totalProductsElement.textContent = data.totalProducts || 0;
        totalItemsElement.textContent = data.totalItemsFound || 0;
        
        // Calcular tempo decorrido
        if (collectionStartTime) {
            const elapsed = Math.round((Date.now() - collectionStartTime) / 1000);
            elapsedTimeElement.textContent = formatSeconds(elapsed);
        }
        
        // Adicionar classe de animação quando estiver rodando
        if (data.status === 'RUNNING' && !progressContainer.classList.contains('running')) {
            progressContainer.classList.add('running');
        } else if (data.status !== 'RUNNING') {
            progressContainer.classList.remove('running');
        }
    }

    // Mostrar view de progresso
    function showProgressView(data) {
        startButton.disabled = true;
        startButton.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Coleta em Andamento...';
        progressContainer.style.display = 'block';
        reportContainer.style.display = 'none';

        updateProgressView(data);
        
        // Iniciar polling se não estiver ativo
        if (!pollingInterval) {
            pollingInterval = setInterval(checkStatus, 2000);
        }
    }

    // Mostrar view de idle/completo
    function showIdleView(data) {
        startButton.disabled = false;
        startButton.innerHTML = '<i class="fas fa-play"></i> Iniciar Coleta Manual';
        progressContainer.style.display = 'none';
        
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }

        // Mostrar relatório se a coleta foi completada
        if ((data.status === 'COMPLETED' || data.status === 'FAILED') && data.report) {
            showReport(data.report);
        } else {
            reportContainer.style.display = 'none';
        }
    }

    // Mostrar relatório
    function showReport(report) {
        reportContainer.style.display = 'block';
        reportContainer.style.animation = 'fadeInUp 0.6s ease';
        
        // Atualizar cards do relatório
        reportTotalItems.textContent = report.totalItemsSaved || 0;
        reportDuration.textContent = formatSeconds(report.totalDurationSeconds);
        
        const marketsCount = report.marketBreakdown ? report.marketBreakdown.length : 0;
        reportMarketsCount.textContent = marketsCount;
        reportDays.textContent = report.diasPesquisa || 3;
        
        // Limpar e preencher tabela
        reportTableBody.innerHTML = '';
        
        if (report.marketBreakdown && report.marketBreakdown.length > 0) {
            report.marketBreakdown.forEach((market, index) => {
                const row = document.createElement('tr');
                row.style.animationDelay = `${index * 0.1}s`;
                
                const status = market.itemsFound > 0 ? 'success' : 'warning';
                const statusText = market.itemsFound > 0 ? 'Sucesso' : 'Sem dados';
                const statusIcon = market.itemsFound > 0 ? 'fa-check-circle' : 'fa-exclamation-triangle';
                
                row.innerHTML = `
                    <td>
                        <div class="market-name">${market.marketName}</div>
                        <small>${market.diasPesquisa || report.diasPesquisa || 3} dias</small>
                    </td>
                    <td class="items-count">${market.itemsFound}</td>
                    <td class="duration">${formatSeconds(market.duration)}</td>
                    <td>
                        <span class="status-badge ${status}">
                            <i class="fas ${statusIcon}"></i>
                            ${statusText}
                        </span>
                    </td>
                `;
                reportTableBody.appendChild(row);
            });
        }
    }

    // ========== FUNÇÕES PRINCIPAIS ==========

    // Carregar lista de mercados
    async function loadMarkets() {
        try {
            console.log('Carregando mercados...');
            
            const isAuthenticated = await window.checkAuth();
            if (!isAuthenticated) {
                showNotification('Usuário não autenticado. Redirecionando...', 'error');
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 2000);
                return;
            }
            
            const response = await window.authenticatedFetch('/api/supermarkets');
            
            if (!response.ok) {
                if (response.status === 401) {
                    showNotification('Sessão expirada. Faça login novamente.', 'error');
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const markets = await response.json();
            console.log('Mercados recebidos:', markets);
            
            if (!markets || markets.length === 0) {
                renderNoMarkets();
                return;
            }
            
            renderMarkets(markets);
            updateSelectedMarketsCount();
            
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
            showNotification(`Erro ao carregar mercados: ${error.message}`, 'error');
            renderNoMarkets();
        }
    }

    // Verificar status da coleta
    const checkStatus = async () => {
        try {
            const response = await window.authenticatedFetch('/api/collection-status');
            if (!response.ok) {
                if (response.status === 404) {
                    showIdleView({ status: 'IDLE' });
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error('Erro ao verificar status:', error.message);
        }
    };

    // Iniciar coleta
    const startCollection = async () => {
        const selectedMarkets = getSelectedMarkets();
        const selectedDays = getSelectedDays();
        
        if (selectedMarkets.length === 0) {
            showNotification('Selecione pelo menos um mercado para coletar', 'error');
            return;
        }

        if (!confirm(`Iniciar coleta em ${selectedMarkets.length} mercados com ${selectedDays} dias de pesquisa?`)) {
            return;
        }

        // Esconder relatório anterior
        reportContainer.style.display = 'none';
        collectionStartTime = Date.now();
        
        try {
            const response = await window.authenticatedFetch('/api/trigger-collection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    markets: selectedMarkets,
                    days: selectedDays
                })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Erro desconhecido');
            
            showNotification(data.message || 'Coleta iniciada com sucesso!', 'success');
            checkStatus();
        } catch (error) {
            showNotification(`Falha ao iniciar a coleta: ${error.message}`, 'error');
            checkStatus();
        }
    };

    // Configurar event listeners
    function setupEventListeners() {
        // Toggle do tema
        themeToggle.addEventListener('click', toggleTheme);

        // Menu mobile
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', toggleMobileMenu);
        }

        // Overlay do sidebar
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', closeMobileMenu);
        }

        // Dropdown do usuário
        if (userMenuBtn && userDropdown) {
            userMenuBtn.addEventListener('click', toggleUserDropdown);
        }

        // Fechar dropdown ao clicar fora
        document.addEventListener('click', closeUserDropdown);

        // Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        // Botão de iniciar coleta
        if (startButton) {
            startButton.addEventListener('click', startCollection);
        }
    }

    // Configuração inicial
    async function initializeConfiguration() {
        const isAuthenticated = await window.checkAuth();
        if (!isAuthenticated) {
            showNotification('Usuário não autenticado. Redirecionando...', 'error');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
            return;
        }

        const hasColetaPermission = await window.hasPermission('coleta');
        if (!hasColetaPermission) {
            showNotification('Você não tem permissão para acessar esta página.', 'error');
            setTimeout(() => {
                window.location.href = '/search.html';
            }, 2000);
            return;
        }

        await loadMarkets();
        setupDaysSelection();
    }

    // ========== INICIALIZAÇÃO ==========

    // Inicialização
    initializeConfiguration();
    setupEventListeners();
    checkStatus();

    console.log('Admin.js carregado');

    // Verificar se há dados no Supabase
    async function debugMarkets() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            console.log('Usuário logado:', user);
            
            const { data: markets, error } = await supabase
                .from('supermercados')
                .select('nome, cnpj, endereco')
                .order('nome');
                
            console.log('Mercados do Supabase:', markets);
            console.log('Erro:', error);
        } catch (error) {
            console.error('Debug error:', error);
        }
    }

    // Executar debug após 2 segundos
    setTimeout(debugMarkets, 2000);
});
