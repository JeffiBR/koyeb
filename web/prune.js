document.addEventListener('DOMContentLoaded', () => {
    const marketSelect = document.getElementById('marketSelect');
    const collectionsContainer = document.getElementById('collectionsContainer');
    const collectionsCheckboxList = document.getElementById('collectionsCheckboxList');
    const pruneButton = document.getElementById('pruneButton');
    const resultMessage = document.getElementById('resultMessage');

    // Função para fazer requisições autenticadas
    const authenticatedFetch = async (url, options = {}) => {
        const { data: { session } } = await supabase.auth.getSession();
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (session) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        return fetch(url, {
            ...options,
            headers
        });
    };

    const loadSupermarkets = async () => {
        try {
            const response = await authenticatedFetch(`/api/supermarkets`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Não foi possível carregar os supermercados.");
            }
            
            const markets = await response.json();
            
            marketSelect.innerHTML = '<option value="">-- Selecione um supermercado --</option>';
            markets.forEach(market => {
                const option = document.createElement('option');
                option.value = market.cnpj;
                option.textContent = market.nome;
                marketSelect.appendChild(option);
            });
        } catch (error) {
            marketSelect.innerHTML = `<option value="">Erro: ${error.message}</option>`;
            console.error('Erro ao carregar supermercados:', error);
        }
    };

    const loadCollectionsForMarket = async (cnpj) => {
        collectionsCheckboxList.innerHTML = '<p>Carregando coletas...</p>';
        collectionsContainer.style.display = 'block';
        pruneButton.disabled = true;

        if (!cnpj) {
            collectionsContainer.style.display = 'none';
            return;
        }

        try {
            const response = await authenticatedFetch(`/api/collections-by-market/${cnpj}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Falha ao buscar coletas do mercado.');
            }

            const collections = await response.json();

            collectionsCheckboxList.innerHTML = '';
            if (collections.length === 0) {
                collectionsCheckboxList.innerHTML = '<p>Nenhuma coleta com produtos encontrados para este mercado.</p>';
                return;
            }

            collections.forEach(collection => {
                const date = new Date(collection.iniciada_em).toLocaleDateString('pt-BR');
                const time = new Date(collection.iniciada_em).toLocaleTimeString('pt-BR');
                
                const label = document.createElement('label');
                label.className = 'checkbox-label';
                label.innerHTML = `
                    <input type="checkbox" name="collection" value="${collection.coleta_id}">
                    <span>Coleta #${collection.coleta_id} - ${date} às ${time}</span>
                `;
                collectionsCheckboxList.appendChild(label);
            });
            
            pruneButton.disabled = false;

        } catch (error) {
            collectionsCheckboxList.innerHTML = `<p style="color: var(--danger-color);">Erro: ${error.message}</p>`;
            console.error('Erro ao carregar coletas:', error);
        }
    };

    const performPrune = async () => {
        const selectedCnpj = marketSelect.value;
        const selectedMarketName = marketSelect.options[marketSelect.selectedIndex].text;
        const checkedBoxes = document.querySelectorAll('input[name="collection"]:checked');
        const collection_ids = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

        if (collection_ids.length === 0) {
            alert('Por favor, selecione pelo menos uma coleta para apagar.');
            return;
        }

        const confirmMessage = `Você tem certeza que deseja apagar os dados do supermercado "${selectedMarketName}" para as ${collection_ids.length} coletas selecionadas?\n\nESTA AÇÃO É PERMANENTE E IRREVERSÍVEL.`;
        if (!confirm(confirmMessage)) return;

        pruneButton.disabled = true;
        pruneButton.textContent = 'Apagando...';
        resultMessage.textContent = '';

        try {
            const response = await authenticatedFetch(`/api/prune-by-collections`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    cnpj: selectedCnpj, 
                    collection_ids: collection_ids 
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Erro ao apagar dados.');
            }

            const data = await response.json();
            
            resultMessage.innerHTML = `
                <div style="color: var(--success-color); background: var(--success-bg); padding: 1rem; border-radius: 0.5rem;">
                    <i class="fas fa-check-circle"></i> 
                    Sucesso! ${data.deleted_count || data.affected_rows || 0} registros foram apagados.
                    Atualizando lista de coletas...
                </div>
            `;
            
            // Recarregar a lista de coletas após 2 segundos
            setTimeout(() => {
                loadCollectionsForMarket(selectedCnpj);
                resultMessage.innerHTML = '';
            }, 2000);

        } catch (error) {
            resultMessage.innerHTML = `
                <div style="color: var(--danger-color); background: var(--danger-bg); padding: 1rem; border-radius: 0.5rem;">
                    <i class="fas fa-exclamation-circle"></i> 
                    Erro: ${error.message}
                </div>
            `;
            console.error('Erro ao apagar dados:', error);
        } finally {
            pruneButton.disabled = false;
            pruneButton.textContent = 'Deletar Coletas Selecionadas';
        }
    };

    // Event listeners
    marketSelect.addEventListener('change', () => {
        loadCollectionsForMarket(marketSelect.value);
    });

    pruneButton.addEventListener('click', performPrune);
    
    // Inicializar
    loadSupermarkets();

    // Adicionar estilo para os checkboxes
    const style = document.createElement('style');
    style.textContent = `
        .checkbox-label {
            display: flex;
            align-items: center;
            padding: 0.5rem;
            margin: 0.25rem 0;
            background: var(--card-bg);
            border-radius: 0.25rem;
            cursor: pointer;
        }
        .checkbox-label:hover {
            background: var(--hover-bg);
        }
        .checkbox-label input {
            margin-right: 0.5rem;
        }
    `;
    document.head.appendChild(style);
});
