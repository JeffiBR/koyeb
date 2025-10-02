// user-logs.js

let currentPage = 1;
const pageSize = 20;
let totalLogs = 0;
let currentFilters = {};

document.addEventListener('DOMContentLoaded', function() {
    initializePage();
});

async function initializePage() {
    await loadUsers();
    await loadLogs();
    setupEventListeners();
}

function setupEventListeners() {
    // Filtros
    document.getElementById('filterButton').addEventListener('click', applyFilters);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
    document.getElementById('exportButton').addEventListener('click', exportLogs);
    
    // Ações em lote
    document.getElementById('deleteByDate').addEventListener('click', deleteLogsByDate);
    document.getElementById('deleteByUser').addEventListener('click', deleteLogsByUser);
    document.getElementById('deleteAll').addEventListener('click', deleteAllLogs);
    
    // Paginação
    document.getElementById('prevPage').addEventListener('click', goToPreviousPage);
    document.getElementById('nextPage').addEventListener('click', goToNextPage);
    
    // Enter nos filtros
    document.getElementById('dateFilter').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') applyFilters();
    });
}

async function loadUsers() {
    try {
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.ok) {
            const users = await response.json();
            const userFilter = document.getElementById('userFilter');
            userFilter.innerHTML = '<option value="">Todos os Usuários</option>'; // Opção padrão
            
            users.forEach(user => {
                // Usa o email como texto e o id como valor
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.email; 
                userFilter.appendChild(option);
            });
        } else {
            // Lidar com erro
            showNotification('Erro ao carregar lista de usuários.', 'error');
            console.error('Erro ao carregar usuários:', response.statusText);
        }
    } catch (error) {
        console.error('Erro na requisição de usuários:', error);
        showNotification('Erro de rede ao carregar usuários.', 'error');
    }
}

async function loadLogs() {
    document.querySelector('#logsTable tbody').innerHTML = '<tr><td colspan="7" class="loading-state">Carregando logs...</td></tr>';
    document.getElementById('prevPage').disabled = true;
    document.getElementById('nextPage').disabled = true;

    try {
        const urlParams = new URLSearchParams(currentFilters);
        urlParams.set('page', currentPage);
        urlParams.set('page_size', pageSize);

        const response = await fetch(`/api/user-logs?${urlParams.toString()}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            totalLogs = data.total_logs;
            displayLogs(data.logs);
            updatePaginationInfo();
        } else if (response.status === 403) {
            displayError('Acesso negado. Você não tem permissão para ver esta página.');
        } else {
            throw new Error(response.statusText);
        }
    } catch (error) {
        console.error('Erro ao carregar logs:', error);
        displayError('Erro ao carregar os dados dos logs. Verifique a API.');
    }
}

function displayError(message) {
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading-state error-state">${message}</td></tr>`;
}

function displayLogs(logs) {
    const tbody = document.querySelector('#logsTable tbody');
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-state">Nenhum log encontrado.</td></tr>';
        return;
    }
    
    tbody.innerHTML = logs.map(log => {
        const date = new Date(log.created_at);
        const formattedDate = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR');
        
        // Formato para exibir os mercados
        let marketsDisplay = 'N/A';
        if (Array.isArray(log.selected_markets) && log.selected_markets.length > 0) {
            marketsDisplay = log.selected_markets.length > 3 
                ? `${log.selected_markets.slice(0, 3).join(', ')} e mais ${log.selected_markets.length - 3}`
                : log.selected_markets.join(', ');
        }
        
        // Garante que o nome e email do usuário serão exibidos
        const userName = log.user_name || 'Usuário Desconhecido';
        const userEmail = log.user_email || 'N/A';
        const userInitial = userName ? userName.charAt(0).toUpperCase() : 'U';

        // Determina o ícone da ação
        let actionIcon = '';
        let actionColor = '';
        let actionText = '';

        if (log.action_type === 'search') {
            actionIcon = 'fas fa-search';
            actionColor = 'var(--primary)';
            actionText = 'Busca DB';
        } else if (log.action_type === 'realtime_search') {
            actionIcon = 'fas fa-rocket';
            actionColor = 'var(--accent)';
            actionText = 'Busca Real-Time';
        } else if (log.action_type === 'access') {
            actionIcon = 'fas fa-sign-in-alt';
            actionColor = 'var(--green)';
            actionText = log.page_accessed || 'Acesso Página';
        } else {
            actionIcon = 'fas fa-info-circle';
            actionColor = 'var(--muted-dark)';
            actionText = 'Outra Ação';
        }
        
        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--accent)); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.8rem;">
                            ${userInitial}
                        </div>
                        <div>
                            <div style="font-weight: 600;">${userName}</div>
                            <div style="font-size: 0.8rem; color: var(--muted-dark);">${userEmail}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge" style="background-color: ${actionColor};">
                        <i class="${actionIcon}"></i> ${actionText}
                    </span>
                </td>
                <td>${log.search_term || 'N/A'}</td>
                <td>${marketsDisplay}</td>
                <td>${log.result_count !== undefined && log.result_count !== null ? log.result_count : 'N/A'}</td>
                <td>${formattedDate}</td>
                <td><button class="btn icon-only danger delete-log-btn" data-log-id="${log.log_id}" title="Deletar Log"><i class="fas fa-trash"></i></button></td>
            </tr>
        `;
    }).join('');
    
    // Adiciona listener para botões de deletar individualmente
    document.querySelectorAll('.delete-log-btn').forEach(button => {
        button.addEventListener('click', function() {
            // Implementação de delete individual (se existir na API)
            showNotification('Funcionalidade de exclusão individual não implementada na API atual.', 'info');
        });
    });
}

function updatePaginationInfo() {
    const totalPages = Math.ceil(totalLogs / pageSize);
    document.getElementById('pageInfo').textContent = `Página ${currentPage} de ${totalPages}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

function goToPreviousPage() {
    if (currentPage > 1) {
        currentPage--;
        loadLogs();
    }
}

function goToNextPage() {
    const totalPages = Math.ceil(totalLogs / pageSize);
    if (currentPage < totalPages) {
        currentPage++;
        loadLogs();
    }
}

function applyFilters() {
    const userFilter = document.getElementById('userFilter').value;
    const actionFilter = document.getElementById('actionFilter').value;
    const dateFilter = document.getElementById('dateFilter').value;
    
    currentFilters = {};
    if (userFilter) currentFilters.user_id = userFilter;
    if (actionFilter) currentFilters.action_type = actionFilter;
    if (dateFilter) currentFilters.date_filter = dateFilter;
    
    currentPage = 1; // Volta para a primeira página ao aplicar filtros
    loadLogs();
}

function clearFilters() {
    document.getElementById('userFilter').value = '';
    document.getElementById('actionFilter').value = '';
    document.getElementById('dateFilter').value = '';
    currentFilters = {};
    currentPage = 1;
    loadLogs();
}

async function deleteLogsByDate() {
    const dateToDelete = prompt('Digite a data (YYYY-MM-DD) para deletar todos os logs *anteriores ou iguais* a esta data:');
    if (!dateToDelete) return;
    
    if (!confirm(`Tem certeza que deseja DELETAR TODOS OS LOGS até ${dateToDelete}? Esta ação é irreversível!`)) return;

    try {
        const token = getToken();
        const response = await fetch('/api/user-logs/delete-by-date', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ date: dateToDelete })
        });
        
        if (response.ok) {
            showNotification('Logs deletados com sucesso!', 'success');
            loadLogs(); // Recarrega a lista
        } else {
            throw new Error('Erro ao deletar logs por data.');
        }
    } catch (error) {
        console.error('Erro ao deletar logs por data:', error);
        showNotification('Erro ao deletar logs por data.', 'error');
    }
}

// ... (Implementação de deleteLogsByUser e deleteAllLogs não mostrada para brevidade)

async function exportLogs() {
    try {
        const urlParams = new URLSearchParams(currentFilters);
        const token = getToken();
        
        const response = await fetch(`/api/user-logs/export?${urlParams.toString()}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Define o nome do arquivo dinamicamente
            a.download = `logs-usuarios-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            showNotification('Logs exportados com sucesso!', 'success');
        } else {
            throw new Error('Erro ao exportar logs');
        }
    } catch (error) {
        console.error('Erro ao exportar logs:', error);
        showNotification('Erro ao exportar logs', 'error');
    }
}

function showNotification(message, type = 'info') {
    // Remove notificação existente
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Mostrar notificação
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Remover após 5 segundos
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Função auxiliar para obter o token (já deve existir em auth.js)
function getToken() {
    return localStorage.getItem('supabase.auth.token');
}
