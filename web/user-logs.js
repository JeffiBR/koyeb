// user-logs.js - COM NOMES DOS SUPERMERCADOS (tabela supermercado)

let currentPage = 1;
const logsPerPage = 10;
let allLogs = [];
let marketMap = {}; // Mapa para armazenar CNPJ -> Nome

document.addEventListener('DOMContentLoaded', function() {
    initializePage();
});

async function initializePage() {
    await loadMarketMap(); // Carrega o mapeamento CNPJ -> Nome
    await loadUsersForFilters();
    await loadUserLogs();
    setupEventListeners();
}

// Função para carregar o mapeamento de CNPJ para nome dos mercados
async function loadMarketMap() {
    try {
        console.log('Carregando mapeamento de mercados...');
        
        const { data, error } = await supabase
            .from('supermercados') // Nome da tabela: supermercados
            .select('cnpj, nome'); // Colunas: cnpj e nome

        if (error) {
            console.error('Erro ao carregar mercados:', error);
            return;
        }

        // Cria o mapa CNPJ -> Nome
        marketMap = {};
        data.forEach(market => {
            marketMap[market.cnpj] = market.nome;
        });

        console.log('Mapeamento de mercados carregado:', marketMap);
        
    } catch (error) {
        console.error('Erro ao carregar mapeamento de mercados:', error);
    }
}

// Função para converter CNPJs em nomes de mercados
function getMarketNames(marketData) {
    if (!marketData) return '-';
    
    try {
        // Se for string, tenta converter para array
        let marketArray;
        if (typeof marketData === 'string') {
            // Remove espaços e quebras de linha, depois divide por vírgulas
            marketArray = marketData.replace(/\s+/g, '').split(',');
        } else if (Array.isArray(marketData)) {
            marketArray = marketData;
        } else {
            return '-';
        }

        // Converte cada CNPJ para o nome do mercado
        const marketNames = marketArray.map(cnpj => {
            // Remove qualquer caractere não numérico do CNPJ
            const cleanCnpj = cnpj.replace(/\D/g, '');
            return marketMap[cleanCnpj] || cnpj; // Retorna nome se existir, senão o CNPJ
        });

        return marketNames.join(', ');
        
    } catch (error) {
        console.error('Erro ao processar mercados:', error, marketData);
        return marketData; // Retorna o original em caso de erro
    }
}

async function loadUserLogs(page = 1) {
    try {
        showLoadingState();
        
        console.log('Carregando logs do Supabase...');
        
        const { data, error, count } = await supabase
            .from('log_de_usuarios')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range((page - 1) * logsPerPage, page * logsPerPage - 1);

        if (error) {
            console.error('Erro ao carregar logs:', error);
            showError('Erro ao carregar logs: ' + error.message);
            return;
        }

        console.log('Logs carregados:', data);
        
        if (!data || data.length === 0) {
            renderEmptyState();
            updatePagination(0, page);
            return;
        }

        allLogs = data;
        renderLogsTable(data);
        updatePagination(count, page);
        
    } catch (error) {
        console.error('Erro inesperado:', error);
        showError('Erro inesperado ao carregar logs');
    }
}

function renderLogsTable(logs) {
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = '';

    logs.forEach(log => {
        const row = document.createElement('tr');
        
        // USANDO OS CAMPOS EXATOS DA SUA TABELA E CONVERTENDO CNPJ PARA NOME
        row.innerHTML = `
            <td>${log.user_name || log.user_email || 'N/A'}</td>
            <td>${log.action_type || 'N/A'}</td>
            <td>${log.search_term || '-'}</td>
            <td>${getMarketNames(log.selected_markets)}</td>
            <td>${log.result_count || '0'}</td>
            <td>${formatDateTime(log.created_at)}</td>
            <td>
                <button class="btn danger btn-sm" onclick="deleteLog('${log.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
}

function renderEmptyState() {
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 2rem;">
                <i class="fas fa-inbox" style="font-size: 3rem; color: var(--muted-dark); margin-bottom: 1rem;"></i>
                <p>Nenhum log encontrado.</p>
            </td>
        </tr>
    `;
}

function showError(message) {
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align: center; color: var(--danger); padding: 2rem;">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${message}</p>
                <button class="btn outline btn-sm" onclick="loadUserLogs()">Tentar Novamente</button>
            </td>
        </tr>
    `;
}

function showLoadingState() {
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 2rem;">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Carregando logs...</p>
            </td>
        </tr>
    `;
}

function updatePagination(totalCount, currentPage) {
    const totalPages = Math.ceil(totalCount / logsPerPage);
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');

    pageInfo.textContent = `Página ${currentPage} de ${totalPages || 1}`;
    
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
}

function setupEventListeners() {
    // Paginação
    document.getElementById('prevPage').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadUserLogs(currentPage);
        }
    });

    document.getElementById('nextPage').addEventListener('click', () => {
        currentPage++;
        loadUserLogs(currentPage);
    });

    // Filtros
    document.getElementById('filterButton').addEventListener('click', applyFilters);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
    
    // Ações em lote
    document.getElementById('deleteByDate').addEventListener('click', deleteLogsByDate);
    document.getElementById('deleteByUser').addEventListener('click', deleteLogsByUser);
    document.getElementById('deleteAll').addEventListener('click', deleteAllLogs);
    document.getElementById('exportButton').addEventListener('click', exportLogs);
}

async function loadUsersForFilters() {
    try {
        // Carrega usuários únicos para os filtros
        const { data, error } = await supabase
            .from('log_de_usuarios')
            .select('user_name, user_email')
            .not('user_name', 'is', null);

        if (error) throw error;

        const userFilter = document.getElementById('userFilter');
        const bulkUser = document.getElementById('bulkUser');

        // Adiciona opções de usuário
        const users = [...new Set(data.map(item => item.user_name).filter(Boolean))];
        
        users.forEach(user => {
            const option = `<option value="${user}">${user}</option>`;
            userFilter.innerHTML += option;
            bulkUser.innerHTML += option;
        });

    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
    }
}

// Funções de filtro
async function applyFilters() {
    try {
        const userFilter = document.getElementById('userFilter').value;
        const dateFilter = document.getElementById('dateFilter').value;
        const actionFilter = document.getElementById('actionFilter').value;

        let query = supabase
            .from('log_de_usuarios')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        // Aplicar filtros
        if (userFilter) {
            query = query.eq('user_name', userFilter);
        }
        if (dateFilter) {
            const startDate = new Date(dateFilter);
            const endDate = new Date(dateFilter);
            endDate.setDate(endDate.getDate() + 1);
            
            query = query.gte('created_at', startDate.toISOString())
                        .lt('created_at', endDate.toISOString());
        }
        if (actionFilter) {
            query = query.eq('action_type', actionFilter);
        }

        const { data, error, count } = await query;

        if (error) throw error;

        currentPage = 1;
        allLogs = data || [];
        renderLogsTable(allLogs);
        updatePagination(count, currentPage);

    } catch (error) {
        console.error('Erro ao aplicar filtros:', error);
        showError('Erro ao aplicar filtros');
    }
}

function clearFilters() {
    document.getElementById('userFilter').value = '';
    document.getElementById('dateFilter').value = '';
    document.getElementById('actionFilter').value = '';
    loadUserLogs(1);
}

// Funções de exclusão
async function deleteLog(logId) {
    if (!confirm('Tem certeza que deseja excluir este log?')) return;

    try {
        const { error } = await supabase
            .from('log_de_usuarios')
            .delete()
            .eq('id', logId);

        if (error) throw error;

        // Recarregar a lista
        loadUserLogs(currentPage);
    } catch (error) {
        console.error('Erro ao excluir log:', error);
        alert('Erro ao excluir log: ' + error.message);
    }
}

async function deleteLogsByDate() {
    const date = document.getElementById('bulkDate').value;
    if (!date) {
        alert('Selecione uma data para excluir os logs.');
        return;
    }

    if (!confirm(`Tem certeza que deseja excluir TODOS os logs da data ${date}? Esta ação não pode ser desfeita.`)) return;

    try {
        const startDate = new Date(date);
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);

        const { error } = await supabase
            .from('log_de_usuarios')
            .delete()
            .gte('created_at', startDate.toISOString())
            .lt('created_at', endDate.toISOString());

        if (error) throw error;

        alert('Logs excluídos com sucesso!');
        loadUserLogs(1);
    } catch (error) {
        console.error('Erro ao excluir logs por data:', error);
        alert('Erro ao excluir logs: ' + error.message);
    }
}

async function deleteLogsByUser() {
    const userName = document.getElementById('bulkUser').value;
    if (!userName) {
        alert('Selecione um usuário para excluir os logs.');
        return;
    }

    if (!confirm(`Tem certeza que deseja excluir TODOS os logs do usuário ${userName}? Esta ação não pode ser desfeita.`)) return;

    try {
        const { error } = await supabase
            .from('log_de_usuarios')
            .delete()
            .eq('user_name', userName);

        if (error) throw error;

        alert('Logs excluídos com sucesso!');
        loadUserLogs(1);
    } catch (error) {
        console.error('Erro ao excluir logs por usuário:', error);
        alert('Erro ao excluir logs: ' + error.message);
    }
}

async function deleteAllLogs() {
    if (!confirm('Tem certeza que deseja excluir TODOS os logs? Esta ação não pode ser desfeita.')) return;

    try {
        const { error } = await supabase
            .from('log_de_usuarios')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Exclui tudo

        if (error) throw error;

        alert('Todos os logs foram excluídos com sucesso!');
        loadUserLogs(1);
    } catch (error) {
        console.error('Erro ao excluir todos os logs:', error);
        alert('Erro ao excluir logs: ' + error.message);
    }
}

async function exportLogs() {
    try {
        const { data, error } = await supabase
            .from('log_de_usuarios')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Converter para CSV
        const csv = convertToCSV(data);
        
        // Criar e baixar arquivo
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `logs_usuarios_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (error) {
        console.error('Erro ao exportar logs:', error);
        alert('Erro ao exportar logs: ' + error.message);
    }
}

function convertToCSV(data) {
    if (!data.length) return '';
    
    const headers = ['ID', 'Data/Hora', 'Usuário', 'Email', 'Ação', 'Página Acessada', 'Termo Pesquisado', 'Mercados', 'Resultados'];
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(log => [
        log.id,
        `"${formatDateTime(log.created_at)}"`,
        `"${log.user_name || ''}"`,
        `"${log.user_email || ''}"`,
        `"${log.action_type || ''}"`,
        `"${log.page_accessed || ''}"`,
        `"${log.search_term || ''}"`,
        `"${getMarketNames(log.selected_markets)}"`, // Usa a função para converter para nomes
        log.result_count || '0'
    ].join(','));
    
    return [csvHeaders, ...csvRows].join('\n');
}
