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
            const bulkUser = document.getElementById('bulkUser');
            
            users.forEach(user => {
                // Para filtro
                const option1 = document.createElement('option');
                option1.value = user.id;
                option1.textContent = `${user.full_name} (${user.email})`;
                userFilter.appendChild(option1);
                
                // Para exclusão em lote
                const option2 = document.createElement('option');
                option2.value = user.id;
                option2.textContent = `${user.full_name} (${user.email})`;
                bulkUser.appendChild(option2);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        showNotification('Erro ao carregar lista de usuários', 'error');
    }
}

async function loadLogs() {
    const loader = document.createElement('div');
    loader.className = 'loader-container';
    loader.innerHTML = '<div class="loader"></div><p>Carregando logs...</p>';
    
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = '';
    tbody.appendChild(loader);
    
    try {
        const params = new URLSearchParams({
            page: currentPage,
            page_size: pageSize,
            ...currentFilters
        });
        
        const response = await fetch(`/api/user-logs?${params}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            totalLogs = result.total_count;
            displayLogs(result.data);
            updatePagination();
        } else {
            throw new Error('Erro ao carregar logs');
        }
    } catch (error) {
        console.error('Erro ao carregar logs:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Erro ao carregar logs</td></tr>';
        showNotification('Erro ao carregar logs de usuários', 'error');
    }
}

function displayLogs(logs) {
    const tbody = document.querySelector('#logsTable tbody');
    
    if (logs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <h3>Nenhum log encontrado</h3>
                    <p>Nenhum registro de log corresponde aos filtros aplicados.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--accent)); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.8rem;">
                        ${log.user_name ? log.user_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                        <div style="font-weight: 600;">${log.user_name || 'Usuário Desconhecido'}</div>
                        <div style="font-size: 0.8rem; color: var(--muted-dark);">${log.user_email || 'N/A'}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="status-badge ${getActionBadgeClass(log.action_type)}">
                    ${getActionDisplayName(log.action_type)}
                </span>
            </td>
            <td>
                <div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${log.search_term || '-'}
                </div>
            </td>
            <td>
                ${log.selected_markets && log.selected_markets.length > 0 ? 
                  `<div style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.selected_markets.join(', ')}">
                      ${log.selected_markets.slice(0, 2).join(', ')}${log.selected_markets.length > 2 ? '...' : ''}
                   </div>` : 
                  '-'}
            </td>
            <td>
                ${log.result_count ? `<span style="font-weight: 600; color: var(--primary);">${log.result_count}</span>` : '-'}
            </td>
            <td>
                <div class="collection-date">
                    <span class="date-main">${new Date(log.created_at).toLocaleDateString('pt-BR')}</span>
                    <span class="date-time">${new Date(log.created_at).toLocaleTimeString('pt-BR')}</span>
                </div>
            </td>
            <td>
                <div class="table-actions">
                    <button class="action-btn danger delete-log" data-log-id="${log.log_id}" title="Excluir Log">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Adicionar event listeners para os botões de excluir
    document.querySelectorAll('.delete-log').forEach(button => {
        button.addEventListener('click', function() {
            const logId = this.getAttribute('data-log-id');
            deleteSingleLog(logId);
        });
    });
}

function getActionDisplayName(actionType) {
    const actions = {
        'search': 'Busca',
        'realtime_search': 'Busca Tempo Real',
        'page_access': 'Acesso à Página',
        'collection': 'Coleta de Dados',
        'login': 'Login',
        'logout': 'Logout'
    };
    return actions[actionType] || actionType;
}

function getActionBadgeClass(actionType) {
    const classes = {
        'search': 'concluída',
        'realtime_search': 'em-andamento',
        'page_access': 'concluída',
        'collection': 'em-andamento',
        'login': 'concluída',
        'logout': 'concluída'
    };
    return classes[actionType] || 'concluída';
}

function applyFilters() {
    currentFilters = {};
    
    const userFilter = document.getElementById('userFilter').value;
    const dateFilter = document.getElementById('dateFilter').value;
    const actionFilter = document.getElementById('actionFilter').value;
    
    if (userFilter) currentFilters.user_id = userFilter;
    if (dateFilter) currentFilters.date = dateFilter;
    if (actionFilter) currentFilters.action_type = actionFilter;
    
    currentPage = 1;
    loadLogs();
}

function clearFilters() {
    document.getElementById('userFilter').value = '';
    document.getElementById('dateFilter').value = '';
    document.getElementById('actionFilter').value = '';
    
    currentFilters = {};
    currentPage = 1;
    loadLogs();
}

function updatePagination() {
    const totalPages = Math.ceil(totalLogs / pageSize);
    document.getElementById('pageInfo').textContent = `Página ${currentPage} de ${totalPages} (${totalLogs} registros)`;
    
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages || totalPages === 0;
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

async function deleteSingleLog(logId) {
    if (!confirm('Tem certeza que deseja excluir este log?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/user-logs/${logId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.ok) {
            showNotification('Log excluído com sucesso!', 'success');
            loadLogs();
        } else {
            throw new Error('Erro ao excluir log');
        }
    } catch (error) {
        console.error('Erro ao excluir log:', error);
        showNotification('Erro ao excluir log', 'error');
    }
}

async function deleteLogsByDate() {
    const date = document.getElementById('bulkDate').value;
    if (!date) {
        showNotification('Selecione uma data para excluir os logs', 'warning');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja excluir todos os logs do dia ${date}? Esta ação não pode ser desfeita.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/user-logs?date=${date}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(`${result.deleted_count} logs excluídos com sucesso!`, 'success');
            loadLogs();
        } else {
            throw new Error('Erro ao excluir logs');
        }
    } catch (error) {
        console.error('Erro ao excluir logs:', error);
        showNotification('Erro ao excluir logs', 'error');
    }
}

async function deleteLogsByUser() {
    const userId = document.getElementById('bulkUser').value;
    if (!userId) {
        showNotification('Selecione um usuário para excluir os logs', 'warning');
        return;
    }
    
    const userName = document.getElementById('bulkUser').selectedOptions[0].text;
    
    if (!confirm(`Tem certeza que deseja excluir todos os logs do usuário ${userName}? Esta ação não pode ser desfeita.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/user-logs?user_id=${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(`${result.deleted_count} logs excluídos com sucesso!`, 'success');
            loadLogs();
        } else {
            throw new Error('Erro ao excluir logs');
        }
    } catch (error) {
        console.error('Erro ao excluir logs:', error);
        showNotification('Erro ao excluir logs', 'error');
    }
}

async function deleteAllLogs() {
    if (!confirm('Tem certeza que deseja excluir TODOS os logs? Esta ação não pode ser desfeita.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/user-logs', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(`${result.deleted_count} logs excluídos com sucesso!`, 'success');
            loadLogs();
        } else {
            throw new Error('Erro ao excluir logs');
        }
    } catch (error) {
        console.error('Erro ao excluir logs:', error);
        showNotification('Erro ao excluir logs', 'error');
    }
}

async function exportLogs() {
    try {
        const params = new URLSearchParams(currentFilters);
        const response = await fetch(`/api/user-logs/export?${params}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
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
