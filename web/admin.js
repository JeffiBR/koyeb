document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    // Elementos de Progresso
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progressBar');
    const progressPercentText = document.getElementById('progressPercentText');
    const etaText = document.getElementById('etaText');
    const progressText = document.getElementById('progressText');
    const itemsFoundText = document.getElementById('itemsFoundText');
    // Elementos do Relatório
    const reportContainer = document.getElementById('report-container');
    const reportTotalItems = document.getElementById('report-total-items');
    const reportDuration = document.getElementById('report-duration');
    const reportTableBody = document.querySelector('#reportTable tbody');

    // Elementos do tema e navegação - CORRIGIDOS
    const mobileMenuBtn = document.getElementById('mobileMenuBtn'); // Corrigido: era .mobile-menu-button
    const sidebar = document.querySelector('.sidebar');
    const themeToggle = document.getElementById('themeToggle');
    const userMenuBtn = document.getElementById('userMenuBtn'); // Corrigido: era .profile-button
    const userDropdown = document.getElementById('userDropdown'); // Corrigido: era .profile-dropdown
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const logoutBtn = document.getElementById('logoutBtn');

    let pollingInterval;

    // Toggle do tema
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('theme-light');
        document.body.classList.toggle('theme-dark');
        const icon = themeToggle.querySelector('i');
        if (document.body.classList.contains('theme-light')) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    });

    // Toggle do menu mobile - CORRIGIDO
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            if (sidebarOverlay) sidebarOverlay.classList.toggle('show');
        });
    }

    // Fechar menu ao clicar no overlay
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('show');
        });
    }

    // Toggle do dropdown do usuário - CORRIGIDO
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });
    }

    // Fechar dropdown ao clicar fora - CORRIGIDO
    document.addEventListener('click', (e) => {
        if (userDropdown && userMenuBtn && 
            !userMenuBtn.contains(e.target) && 
            !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('show');
        }
    });

    // Logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    const formatSeconds = (secs) => {
        if (secs < 0 || secs === null || secs === undefined) return 'Calculando...';
        if (secs === 0) return '0s';
        const minutes = Math.floor(secs / 60);
        const seconds = secs % 60;
        return `${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`;
    };

    const updateUI = (data) => {
        if (data.status === 'RUNNING') {
            startButton.disabled = true;
            startButton.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Coleta em Andamento...';
            progressContainer.style.display = 'block';
            reportContainer.style.display = 'none';

            const percent = Math.round(data.progressPercent || 0);
            progressBar.style.width = `${percent}%`;
            progressPercentText.textContent = `${percent}%`;
            etaText.textContent = `Tempo Restante: ${formatSeconds(data.etaSeconds)}`;
            progressText.textContent = data.progresso || '...';
            itemsFoundText.textContent = data.totalItemsFound || 0;
            
            if (!pollingInterval) {
                pollingInterval = setInterval(checkStatus, 3000);
            }
        } else {
            startButton.disabled = false;
            startButton.innerHTML = '<i class="fas fa-play"></i> Iniciar Coleta Manual';
            progressContainer.style.display = 'none';
            
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }

            if ((data.status === 'COMPLETED' || data.status === 'FAILED') && data.report) {
                reportContainer.style.display = 'block';
                reportTotalItems.textContent = data.report.totalItemsSaved;
                reportDuration.textContent = formatSeconds(data.report.totalDurationSeconds);
                reportTableBody.innerHTML = '';
                data.report.marketBreakdown.forEach(market => {
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${market.marketName}</td><td>${market.itemsFound}</td><td>${market.duration}</td>`;
                    reportTableBody.appendChild(row);
                });
            } else {
                 reportContainer.style.display = 'none';
            }
        }
    };

    const checkStatus = async () => {
        try {
            const response = await authenticatedFetch(`/api/collection-status`);
            if (!response.ok) throw new Error("Falha ao verificar status.");
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error('Erro ao verificar status:', error.message);
            if (pollingInterval) clearInterval(pollingInterval);
            
            // Mostrar notificação de erro
            showNotification(`Erro ao verificar status: ${error.message}`, 'error');
        }
    };

    const startCollection = async () => {
        if (!confirm('Tem certeza que deseja iniciar a coleta de dados?')) return;
        reportContainer.style.display = 'none'; // Esconde relatório antigo
        try {
            const response = await authenticatedFetch(`/api/trigger-collection`, { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail);
            
            showNotification(data.message, 'success');
            checkStatus();
        } catch (error) {
            showNotification(`Falha ao iniciar a coleta: ${error.message}`, 'error');
            checkStatus();
        }
    };

    // Função auxiliar para mostrar notificações
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

    if (startButton) {
        startButton.addEventListener('click', startCollection);
    }
    
    checkStatus();
});
