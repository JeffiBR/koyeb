document.addEventListener('DOMContentLoaded', () => {
    // URL da sua API de supermercados
    const API_URL = '/api/supermarkets';
    
    // Seletores de elementos do DOM
    const tableBody = document.querySelector('#marketsTable tbody');
    const saveButton = document.getElementById('saveButton');
    const cancelButton = document.getElementById('cancelButton');
    const formTitle = document.getElementById('formTitle');
    const marketIdInput = document.getElementById('marketId');
    const marketNameInput = document.getElementById('marketName');
    const marketCnpjInput = document.getElementById('marketCnpj');

    /**
     * Carrega a lista de mercados da API e preenche a tabela.
     * Esta é uma rota pública e não exige autenticação.
     */
    const loadMarkets = async () => {
        // Exibe o spinner de carregamento
        tableBody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; padding: 2rem;">
                    <i class="fas fa-spinner fa-spin"></i> Carregando mercados...
                </td>
            </tr>`;
            
        try {
            // A rota "/public" não precisa de token
            const response = await fetch(`${API_URL}/public`);
            if (!response.ok) {
                throw new Error('Falha na resposta da rede.');
            }
            const markets = await response.json();

            // Limpa a tabela antes de adicionar os novos dados
            tableBody.innerHTML = '';

            if (markets.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Nenhum mercado cadastrado.</td></tr>';
                return;
            }

            markets.forEach(market => {
                const row = document.createElement('tr');
                row.dataset.id = market.id;
                row.innerHTML = `
                    <td>${market.nome}</td>
                    <td>${market.cnpj}</td>
                    <td class="actions">
                        <button class="btn btn-sm edit-btn" data-id="${market.id}" data-nome="${market.nome}" data-cnpj="${market.cnpj}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn btn-sm btn-danger delete-btn" data-id="${market.id}">
                            <i class="fas fa-trash"></i> Excluir
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
            tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: red;">Erro ao carregar mercados.</td></tr>';
            alert('Não foi possível carregar a lista de mercados.');
        }
    };

    /**
     * Reseta o formulário para o estado inicial de "Adicionar Novo Mercado".
     */
    const resetForm = () => {
        formTitle.textContent = 'Adicionar Novo Mercado';
        marketIdInput.value = '';
        marketNameInput.value = '';
        marketCnpjInput.value = '';
        saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar';
        cancelButton.style.display = 'none';
        marketNameInput.focus();
    };
    
    /**
     * Prepara o formulário para editar um mercado existente.
     */
    const setupEditForm = (id, nome, cnpj) => {
        formTitle.textContent = 'Editar Mercado';
        marketIdInput.value = id;
        marketNameInput.value = nome;
        marketCnpjInput.value = cnpj;
        saveButton.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
        cancelButton.style.display = 'inline-block';
        window.scrollTo(0, 0); // Rola a página para o topo para ver o formulário
        marketNameInput.focus();
    };

    /**
     * Salva um novo mercado (POST) ou atualiza um existente (PUT).
     * Requer autenticação.
     */
    const saveMarket = async () => {
        const id = marketIdInput.value;
        const nome = marketNameInput.value.trim();
        const cnpj = marketCnpjInput.value.trim().replace(/\D/g, '');

        if (!nome || !cnpj) {
            alert('Nome e CNPJ são obrigatórios.');
            return;
        }

        // 1. Obtém a sessão do usuário para conseguir o token de acesso
        const session = await getSession();
        if (!session) {
            alert("Sua sessão expirou. Por favor, faça login novamente.");
            window.location.href = '/login.html';
            return;
        }

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/${id}` : API_URL;

        try {
            const response = await fetch(url, {
                method: method,
                // 2. Adiciona o cabeçalho de autorização na requisição
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ nome, cnpj })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Ocorreu um erro no servidor.');
            }

            alert(`Mercado ${id ? 'atualizado' : 'salvo'} com sucesso!`);
            resetForm();
            loadMarkets();

        } catch (error) {
            console.error('Erro ao salvar mercado:', error);
            alert(`Erro ao salvar: ${error.message}`);
        }
    };

    // --- Event Listeners ---

    // Listener para os botões da tabela (Editar e Excluir)
    tableBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const { id, nome, cnpj } = editBtn.dataset;
            setupEditForm(id, nome, cnpj);
        }
        
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            if (!confirm('Tem certeza que deseja excluir este mercado? Esta ação não pode ser desfeita.')) {
                return;
            }
            
            const id = deleteBtn.dataset.id;

            // Obtém a sessão para autenticar a requisição de exclusão
            const session = await getSession();
            if (!session) {
                alert("Sua sessão expirou. Por favor, faça login novamente.");
                window.location.href = '/login.html';
                return;
            }

            try {
                const response = await fetch(`${API_URL}/${id}`, { 
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });

                if (response.ok) {
                    alert('Mercado excluído com sucesso!');
                    loadMarkets();
                } else {
                    const errData = await response.json();
                    throw new Error(errData.detail || 'Falha ao excluir o mercado.');
                }
            } catch (error) {
                console.error('Erro ao excluir mercado:', error);
                alert(`Erro: ${error.message}`);
            }
        }
    });

    // Listener para o botão de salvar/atualizar
    saveButton.addEventListener('click', saveMarket);

    // Listener para o botão de cancelar edição
    cancelButton.addEventListener('click', resetForm);

    // Carrega os mercados ao iniciar a página
    loadMarkets();
});
