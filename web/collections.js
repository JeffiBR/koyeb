// collections.js atualizado
document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/collections';
    const tableBody = document.querySelector('#collectionsTable tbody');

    const formatarData = (dataISO) => {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    };
    
    const formatarNumero = (numero) => {
        if (!numero) return '0';
        return numero.toLocaleString('pt-BR');
    };
    
    const getStatusClass = (status) => {
        if (!status) return '';
        
        const statusLower = status.toLowerCase();
        if (statusLower.includes('concluíd') || statusLower.includes('complet')) {
            return 'status-completed';
        } else if (statusLower.includes('process') || statusLower.includes('execut')) {
            return 'status-processing';
        } else if (statusLower.includes('falha') || statusLower.includes('erro')) {
            return 'status-error';
        }
        return '';
    };

    const loadCollections = async () => {
        try {
            const response = await authenticatedFetch(API_URL);
            if (!response.ok) throw new Error('Falha ao carregar coletas.');
            const collections = await response.json();
            
            tableBody.innerHTML = '';
            if (collections.length === 0) {
                tableBody.innerHTML = '<tr class="empty-row"><td colspan="5" class="empty-table"><i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i><p>Nenhuma coleta encontrada.</p></td></tr>';
                return;
            }
            
            collections.forEach(c => {
                // Adiciona a linha principal da coleta
                const row = document.createElement('tr');
                const dataFormatada = formatarData(c.iniciada_em);
                const statusClass = getStatusClass(c.status);
                
                row.innerHTML = `
                    <td data-label="ID">#${c.id}</td>
                    <td data-label="Iniciada em" data-date="${c.iniciada_em}">${dataFormatada}</td>
                    <td data-label="Status"><span class="status-badge ${statusClass}">${c.status || 'N/A'}</span></td>
                    <td data-label="Total de Registros">${formatarNumero(c.total_registros)}</td>
                    <td data-label="Ações" class="actions">
                        <button class="details-btn" data-id="${c.id}"><i class="fas fa-eye"></i> Detalhes</button>
                        <button class="delete-btn" data-id="${c.id}"><i class="fas fa-trash"></i> Excluir</button>
                    </td>
                `;
                tableBody.appendChild(row);

                // Adiciona a linha de detalhes, inicialmente escondida
                const detailsRow = document.createElement('tr');
                detailsRow.classList.add('details-row');
                detailsRow.id = `details-${c.id}`;
                detailsRow.style.display = 'none';
                detailsRow.innerHTML = `<td colspan="5"><div class="details-content">Carregando detalhes...</div></td>`;
                tableBody.appendChild(detailsRow);
            });
        } catch (error) {
            console.error('Erro ao carregar coletas:', error);
            tableBody.innerHTML = `<tr class="empty-row"><td colspan="5" class="empty-table" style="color: var(--error);"><i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i><p>${error.message}</p></td></tr>`;
        }
    };

    tableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const button = target.closest('button');

        if (!button) return;

        // Lógica para o botão "Ver Detalhes"
        if (button.classList.contains('details-btn')) {
            const id = button.dataset.id;
            const detailsRow = document.getElementById(`details-${id}`);
            const detailsContent = detailsRow.querySelector('.details-content');
            const detailsButton = button;

            // Alterna a visibilidade da linha de detalhes
            const isVisible = detailsRow.style.display !== 'none';
            detailsRow.style.display = isVisible ? 'none' : '';
            detailsButton.innerHTML = isVisible ? '<i class="fas fa-eye"></i> Detalhes' : '<i class="fas fa-times"></i> Ocultar';

            // Se for a primeira vez que abre, busca os dados na API
            if (!isVisible && detailsContent.innerHTML === 'Carregando detalhes...') {
                 try {
                    const response = await authenticatedFetch(`${API_URL}/${id}/details`);
                    if (!response.ok) throw new Error('Falha ao buscar detalhes.');
                    const details = await response.json();
                    
                    if(details.length === 0) {
                        detailsContent.innerHTML = '<p>Nenhum item foi coletado para esta execução.</p>';
                        return;
                    }

                    // Calcular totais
                    const totalMercados = details.length;
                    const totalItens = details.reduce((acc, curr) => acc + (curr.total_itens || 0), 0);
                    
                    let detailsHtml = `
                        <h4>Detalhes da Coleta #${id}</h4>
                        <div class="market-cards">
                    `;
                    
                    details.forEach(detail => {
                        detailsHtml += `
                            <div class="market-card">
                                <span class="market-name">${detail.nome_supermercado || 'Mercado desconhecido'}</span>
                                <span class="items-count">${formatarNumero(detail.total_itens)} itens coletados</span>
                            </div>
                        `;
                    });
                    
                    detailsHtml += `
                        </div>
                        <div class="summary-row">
                            <div class="summary-item">
                                <span class="summary-value">${totalMercados}</span>
                                <span class="summary-label">Mercados</span>
                            </div>
                            <div class="summary-item">
                                <span class="summary-value">${formatarNumero(totalItens)}</span>
                                <span class="summary-label">Itens no total</span>
                            </div>
                        </div>
                    `;
                    
                    detailsContent.innerHTML = detailsHtml;

                } catch (error) {
                    detailsContent.innerHTML = `<p style="color: var(--error);"><i class="fas fa-exclamation-circle"></i> ${error.message}</p>`;
                }
            }
        }

        // Lógica para o botão "Excluir"
        if (button.classList.contains('delete-btn')) {
            const id = button.dataset.id;
            const confirmacao = confirm(`Tem certeza que deseja excluir a coleta #${id}?`);
            
            if (confirmacao) {
                try {
                    const response = await authenticatedFetch(`${API_URL}/${id}`, {
                        method: 'DELETE'
                    });
                    
                    if (!response.ok) throw new Error('Falha ao excluir coleta.');
                    
                    // Recarregar a lista
                    loadCollections();
                    
                    // Mostrar notificação de sucesso
                    showNotification('Coleta excluída com sucesso!', 'success');
                } catch (error) {
                    console.error('Erro ao excluir coleta:', error);
                    showNotification(error.message, 'error');
                }
            }
        }
    });
    
    // Função para mostrar notificações
    const showNotification = (message, type = 'info') => {
        // Remove notificações existentes
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notif => notif.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            ${message}
        `;
        
        document.body.appendChild(notification);
        
        // Mostrar notificação
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Ocultar e remover após 3 segundos
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    };

    loadCollections();
});
