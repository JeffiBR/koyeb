// user-logs.js (versão corrigida)

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
    logPageAccess();
}

function setupEventListeners() {
    document.getElementById('filterButton').addEventListener('click', applyFilters);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
    document.getElementById('exportButton').addEventListener('click', exportLogs);
    
    document.getElementById('deleteByDate').addEventListener('click', deleteLogsByDate);
    document.getElementById('deleteByUser').addEventListener('click', deleteLogsByUser);
    document.getElementById('deleteAll').addEventListener('click', deleteAllLogs);
    
    document.getElementById('prevPage').addEventListener('click', goToPreviousPage);
    document.getElementById('nextPage').addEventListener('click', goToNextPage);
    
    document.getElementById('dateFilter').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') applyFilters();
    });
}

async function logPageAccess() {
    try {
        await authenticatedFetch('/api/log-page-access', {
            method: 'POST',
            body: JSON.stringify({
                page_key: 'user_logs'
            })
        });
    } catch (error) {
        console.error('Erro ao registrar acesso à página:', error);
    }
}

async function loadUsers() {
    try {
        const response = await authenticatedFetch('/api/users');
        
        if (response.ok) {
            const users = await response.json();
            const userFilter = document.getElementById('userFilter');
            const bulkUser = document.getElementById('bulkUser');
            
            userFilter.innerHTML = '<option value="">Todos os Usuários</option>';
            bulkUser.innerHTML = '<option value="">Selecionar usuário...</option>';
            
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                const displayName = user.full_name || user.email || `Usuário ${user.id.substring(0, 8)}`;
                option.textContent = displayName;
                userFilter.appendChild(option);
                
                const bulkOption = option.cloneNode(true);
                bulkUser.appendChild(bulkOption);
            });
        } else {
            showNotification('Erro ao carregar lista de usuários.', 'error');
        }
    } catch (error) {
        console.error('Erro na requisição de usuários:', error);
        showNotification('Erro de rede ao carregar usuários.', 'error');
    }
}

async function loadLogs() {
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading-state">Carregando logs...</td></tr>';
    document.getElementById('prevPage').disabled = true;
    document.getElementById('nextPage').disabled = true;

    try {
        const params = new URLSearchParams();
        params.set('page', currentPage);
        params.set('page_size', pageSize);
        
        if (currentFilters.user_id) {
            params.set('user_id', currentFilters.user_id);
        }
        if (currentFilters.action_type) {
            params.set('action_type', currentFilters.action_type);
        }
        if (currentFilters.date) {
            params.set('date', currentFilters.date);
        }

        const response = await authenticatedFetch(`/api/user-logs?${params.toString()}`);

        if (response.ok) {
            const data = await response.json();
            console.log('Dados recebidos da API:', data); // Para debug
            totalLogs = data.total_count || 0;
            displayLogs(data.data || []);
            updatePaginationInfo();
        } else if (response.status === 403) {
            displayError('Acesso negado. Você não tem permissão para ver esta página.');
        } else {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Erro ao carregar logs:', error);
        if (error.message.includes('Sessão não encontrada')) {
            displayError('Sessão expirada. Faça login novamente.');
        } else {
            displayError('Erro ao carregar os dados dos logs.');
        }
    }
}

function displayError(message) {
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading-state error-state">${message}</td></tr>`;
}

function displayLogs(logs) {
    const tbody = document.querySelector('#logsTable tbody');
    if (!logs || logs.length === 0) {
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
            actionText = log.action_type || 'Outra Ação';
        }
        
        // CORREÇÃO: usar log.id em vez de log.log_id
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
                <td>
                    <button class="btn icon-only danger delete-log-btn" data-log-id="${log.id}" title="Deletar Log">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Adiciona listener para botões de deletar individualmente
    document.querySelectorAll('.delete-log-btn').forEach(button => {
        button.addEventListener('click', function() {
            const logId = this.getAttribute('data-log-id');
            deleteSingleLog(logId);
        });
    });
}

async function deleteSingleLog(logId) {
    if (!confirm('Tem certeza que deseja deletar este log?')) return;

    try {
        const response = await authenticatedFetch(`/api/user-logs/${logId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(`Log deletado com sucesso! (${result.deleted_count} excluído)`, 'success');
            loadLogs();
        } else {
            throw new Error('Erro ao deletar log individual');
        }
    } catch (error) {
        console.error('Erro ao deletar log individual:', error);
        showNotification('Erro ao deletar log individual.', 'error');
    }
}

function updatePaginationInfo() {
    const totalPages = Math.ceil(totalLogs / pageSize);
    document.getElementById('pageInfo').textContent = `Página ${currentPage} de ${totalPages}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages || totalPages === 0;
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
    if (dateFilter) currentFilters.date = dateFilter;
    
    currentPage = 1;
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
        const response = await authenticatedFetch('/api/user-logs/delete-by-date', {
            method: 'POST',
            body: JSON.stringify({ date: dateToDelete })
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(result.message || 'Logs deletados com sucesso!', 'success');
            loadLogs();
        } else {
            throw new Error('Erro ao deletar logs por data.');
        }
    } catch (error) {
        console.error('Erro ao deletar logs por data:', error);
        showNotification('Erro ao deletar logs por data.', 'error');
    }
}

async function deleteLogsByUser() {
    const userId = document.getElementById('bulkUser').value;
    if (!userId) {
        showNotification('Selecione um usuário no campo "Excluir Logs por Usuário" primeiro.', 'warning');
        return;
    }
    
    const userText = document.getElementById('bulkUser').options[document.getElementById('bulkUser').selectedIndex].text;
    
    if (!confirm(`Tem certeza que deseja DELETAR TODOS OS LOGS do usuário "${userText}"? Esta ação é irreversível!`)) return;

    try {
        const response = await authenticatedFetch(`/api/user-logs?user_id=${userId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(result.message || `Logs do usuário deletados com sucesso! (${result.deleted_count} excluídos)`, 'success');
            loadLogs();
        } else {
            throw new Error('Erro ao deletar logs do usuário.');
        }
    } catch (error) {
        console.error('Erro ao deletar logs do usuário:', error);
        showNotification('Erro ao deletar logs do usuário.', 'error');
    }
}

async function deleteAllLogs() {
    if (!confirm('Tem certeza que deseja DELETAR TODOS OS LOGS? Esta ação é irreversível e deletará todos os registros!')) return;

    try {
        const response = await authenticatedFetch('/api/user-logs', {
            method: 'DELETE'
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(result.message || 'Todos os logs foram deletados com sucesso!', 'success');
            loadLogs();
        } else {
            throw new Error('Erro ao deletar todos os logs.');
        }
    } catch (error) {
        console.error('Erro ao deletar todos os logs:', error);
        showNotification('Erro ao deletar todos os logs.', 'error');
    }
}

async function exportLogs() {
    try {
        const params = new URLSearchParams();
        
        if (currentFilters.user_id) {
            params.set('user_id', currentFilters.user_id);
        }
        if (currentFilters.action_type) {
            params.set('action_type', currentFilters.action_type);
        }
        if (currentFilters.date) {
            params.set('date', currentFilters.date);
        }

        const response = await authenticatedFetch(`/api/user-logs/export?${params.toString()}`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `logs-usuarios-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
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
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check';
    if (type === 'error') icon = 'exclamation-triangle';
    if (type === 'warning') icon = 'exclamation';
    
    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 5000);
}

// CSS para melhorar a exibição
const style = document.createElement('style');
style.textContent = `
    .loading-state {
        text-align: center;
        padding: 2rem;
        color: var(--muted-dark);
    }
    
    .error-state {
        color: var(--error);
        background-color: rgba(239, 68, 68, 0.1);
    }
    
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        color: white;
        z-index: 1000;
        transform: translateX(400px);
        transition: transform 0.3s ease;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        max-width: 400px;
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification.success {
        background-color: var(--success);
    }
    
    .notification.error {
        background-color: var(--error);
    }
    
    .notification.warning {
        background-color: var(--warning);
        color: var(--text);
    }
    
    .notification.info {
        background-color: var(--info);
    }
    
    .badge {
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        color: white;
        font-size: 0.8rem;
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
    }
`;
document.head.appendChild(style);
