// groups.js - Gerenciamento de Grupos e Associações
document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI ---
    const groupFormTitle = document.getElementById('groupFormTitle');
    const groupIdInput = document.getElementById('groupId');
    const groupNameInput = document.getElementById('groupName');
    const accessDaysInput = document.getElementById('accessDays');
    const groupDescriptionInput = document.getElementById('groupDescription');
    const saveGroupBtn = document.getElementById('saveGroupBtn');
    const cancelGroupButton = document.getElementById('cancelGroupButton');
    const groupsTableBody = document.getElementById('groupsTableBody');

    // --- ELEMENTOS PARA ASSOCIAÇÕES ---
    const userSelect = document.getElementById('userSelect');
    const groupSelect = document.getElementById('groupSelect');
    const expirationDateInput = document.getElementById('expirationDate');
    const addUserToGroupBtn = document.getElementById('addUserToGroupBtn');
    const userGroupsTableBody = document.getElementById('userGroupsTableBody');

    // --- FUNÇÕES PARA GRUPOS ---

    const loadGroups = async () => {
        try {
            const response = await authenticatedFetch('/api/groups');
            
            if (!response.ok) {
                throw new Error('Erro ao carregar grupos');
            }
            
            const groups = await response.json();
            
            groupsTableBody.innerHTML = '';
            groups.forEach(group => {
                const row = document.createElement('tr');
                row.dataset.group = JSON.stringify(group);

                row.innerHTML = `
                    <td>${group.nome}</td>
                    <td>${group.dias_acesso} dias</td>
                    <td>${group.descricao || 'Sem descrição'}</td>
                    <td>${new Date(group.created_at).toLocaleDateString('pt-BR')}</td>
                    <td class="actions">
                        <button class="btn-icon edit-group-btn" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon delete-group-btn" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                    </td>
                `;
                groupsTableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
            alert('Não foi possível carregar a lista de grupos.');
        }
    };

    const resetGroupForm = () => {
        groupFormTitle.textContent = 'Criar Novo Grupo';
        groupIdInput.value = '';
        groupNameInput.value = '';
        accessDaysInput.value = '30';
        groupDescriptionInput.value = '';
        saveGroupBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Grupo';
        cancelGroupButton.style.display = 'none';
    };

    const populateGroupFormForEdit = (group) => {
        groupFormTitle.textContent = `Editando Grupo: ${group.nome}`;
        groupIdInput.value = group.id;
        groupNameInput.value = group.nome;
        accessDaysInput.value = group.dias_acesso;
        groupDescriptionInput.value = group.descricao || '';
        
        saveGroupBtn.innerHTML = '<i class="fas fa-save"></i> Atualizar Grupo';
        cancelGroupButton.style.display = 'inline-flex';
        window.scrollTo({ top: document.querySelector('.form-container').offsetTop, behavior: 'smooth' });
    };

    const saveGroup = async () => {
        const id = groupIdInput.value;
        const nome = groupNameInput.value.trim();
        const dias_acesso = parseInt(accessDaysInput.value);
        const descricao = groupDescriptionInput.value.trim();

        if (!nome) {
            alert('Nome do grupo é obrigatório.');
            return;
        }

        if (!dias_acesso || dias_acesso < 1 || dias_acesso > 365) {
            alert('Dias de acesso deve ser entre 1 e 365.');
            return;
        }

        const isUpdating = !!id;
        const url = isUpdating ? `/api/groups/${id}` : '/api/groups';
        const method = isUpdating ? 'PUT' : 'POST';
        
        const body = JSON.stringify({ 
            nome, 
            dias_acesso, 
            descricao: descricao || null 
        });

        const originalButtonText = saveGroupBtn.innerHTML;
        saveGroupBtn.disabled = true;
        saveGroupBtn.innerHTML = isUpdating ? 'Atualizando...' : 'Criando...';

        try {
            const response = await authenticatedFetch(url, { method, body });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao salvar grupo');
            }
            
            alert(`Grupo ${isUpdating ? 'atualizado' : 'criado'} com sucesso!`);
            resetGroupForm();
            loadGroups();
            loadGroupsForSelect(); // Recarregar grupos no select
        } catch (error) {
            console.error('Erro ao salvar grupo:', error);
            alert(`Erro: ${error.message}`);
        } finally {
            saveGroupBtn.disabled = false;
            saveGroupBtn.innerHTML = originalButtonText;
        }
    };

    const deleteGroup = async (id, groupName) => {
        if (!confirm(`Tem certeza que deseja excluir o grupo "${groupName}"? Esta ação não pode ser desfeita e removerá todos os usuários associados.`)) return;

        try {
            const response = await authenticatedFetch(`/api/groups/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Falha ao excluir o grupo.');
            }
            alert('Grupo excluído com sucesso!');
            loadGroups();
            loadGroupsForSelect(); // Recarregar grupos no select
            loadUserGroups(); // Recarregar associações
        } catch (error) {
            console.error('Erro ao excluir grupo:', error);
            alert(error.message);
        }
    };

    // --- FUNÇÕES PARA ASSOCIAÇÕES USUÁRIO-GRUPO ---

    const loadUsersForSelect = async () => {
        try {
            const response = await authenticatedFetch('/api/users');
            
            if (!response.ok) {
                throw new Error('Erro ao carregar usuários');
            }
            
            const users = await response.json();
            
            userSelect.innerHTML = '<option value="">Selecione um usuário</option>';
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.full_name} (${user.email})`;
                userSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar usuários para select:', error);
        }
    };

    const loadGroupsForSelect = async () => {
        try {
            const response = await authenticatedFetch('/api/groups');
            
            if (!response.ok) {
                throw new Error('Erro ao carregar grupos');
            }
            
            const groups = await response.json();
            
            groupSelect.innerHTML = '<option value="">Selecione um grupo</option>';
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = `${group.nome} (${group.dias_acesso} dias)`;
                groupSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar grupos para select:', error);
        }
    };

    const loadUserGroups = async () => {
        try {
            const response = await authenticatedFetch('/api/user-groups');
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Erro na resposta:', response.status, errorText);
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            
            const userGroups = await response.json();
            console.log('Dados carregados:', userGroups);
            
            userGroupsTableBody.innerHTML = '';
            
            if (!userGroups || userGroups.length === 0) {
                userGroupsTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhuma associação encontrada</td></tr>';
                return;
            }
            
            userGroups.forEach(userGroup => {
                const isExpired = new Date(userGroup.data_expiracao) < new Date();
                const statusClass = isExpired ? 'status-expired' : 'status-active';
                const statusText = isExpired ? 'Expirado' : 'Ativo';

                const row = document.createElement('tr');
                row.dataset.userGroup = JSON.stringify(userGroup);

                row.innerHTML = `
                    <td>${userGroup.user_name || 'N/A'}</td>
                    <td>${userGroup.user_email || 'N/A'}</td>
                    <td>${userGroup.grupo_nome}</td>
                    <td>${new Date(userGroup.data_expiracao).toLocaleDateString('pt-BR')}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td class="actions">
                        <button class="btn-icon renew-user-btn" title="Renovar Acesso"><i class="fas fa-sync-alt"></i></button>
                        <button class="btn-icon remove-user-btn" title="Remover do Grupo"><i class="fas fa-user-minus"></i></button>
                    </td>
                `;
                userGroupsTableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro ao carregar associações usuário-grupo:', error);
            userGroupsTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--error-color);">Erro ao carregar associações</td></tr>';
        }
    };

    const addUserToGroup = async () => {
        const userId = userSelect.value;
        const groupId = groupSelect.value;
        const expirationDate = expirationDateInput.value;

        if (!userId || !groupId) {
            alert('Usuário e Grupo são obrigatórios.');
            return;
        }

        // Validar e converter groupId para número
        const groupIdNum = parseInt(groupId);
        if (isNaN(groupIdNum)) {
            alert('ID do grupo inválido.');
            return;
        }

        const bodyData = {
            user_id: userId,
            group_id: groupIdNum
        };

        // Adicionar data de expiração apenas se fornecida
        if (expirationDate) {
            // Validar formato da data
            const dateObj = new Date(expirationDate);
            if (isNaN(dateObj.getTime())) {
                alert('Data de expiração inválida. Use o formato YYYY-MM-DD.');
                return;
            }
            bodyData.data_expiracao = expirationDate;
        }

        console.log('Enviando dados para API:', bodyData);

        const originalButtonText = addUserToGroupBtn.innerHTML;
        addUserToGroupBtn.disabled = true;
        addUserToGroupBtn.innerHTML = 'Adicionando...';

        try {
            const response = await authenticatedFetch('/api/user-groups', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bodyData)
            });
            
            if (!response.ok) {
                let errorMessage = 'Erro ao adicionar usuário ao grupo';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                } catch (e) {
                    errorMessage = `Erro ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }
            
            const result = await response.json();
            console.log('Resposta da API:', result);
            
            alert('Usuário adicionado ao grupo com sucesso!');
            
            // Limpar formulário
            userSelect.value = '';
            groupSelect.value = '';
            expirationDateInput.value = '';
            
            // Recarregar dados
            await loadUserGroups();
            
        } catch (error) {
            console.error('Erro completo ao adicionar usuário ao grupo:', error);
            alert(`Erro: ${error.message}`);
        } finally {
            addUserToGroupBtn.disabled = false;
            addUserToGroupBtn.innerHTML = originalButtonText;
        }
    };

    // FUNÇÃO CORRIGIDA - usando o endpoint alternativo
    const renewUserAccess = async (userGroupId, days = 30) => {
        try {
            const response = await authenticatedFetch(`/api/user-groups/${userGroupId}/renew`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ dias_adicionais: days })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao renovar acesso');
            }
            
            const result = await response.json();
            alert(result.message || 'Acesso renovado com sucesso!');
            loadUserGroups();
        } catch (error) {
            console.error('Erro ao renovar acesso:', error);
            alert(error.message);
        }
    };

    const removeUserFromGroup = async (userGroupId, userName) => {
        if (!confirm(`Tem certeza que deseja remover "${userName}" do grupo?`)) return;

        try {
            const response = await authenticatedFetch(`/api/user-groups/${userGroupId}`, { 
                method: 'DELETE' 
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Falha ao remover usuário do grupo.');
            }
            
            alert('Usuário removido do grupo com sucesso!');
            loadUserGroups();
        } catch (error) {
            console.error('Erro ao remover usuário do grupo:', error);
            alert(error.message);
        }
    };

    // --- EVENT LISTENERS ---

    // Event listeners para grupos
    groupsTableBody.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-group-btn');
        const deleteButton = e.target.closest('.delete-group-btn');
        
        if (editButton) {
            const group = JSON.parse(editButton.closest('tr').dataset.group);
            populateGroupFormForEdit(group);
        }

        if (deleteButton) {
            const group = JSON.parse(deleteButton.closest('tr').dataset.group);
            deleteGroup(group.id, group.nome);
        }
    });

    // Event listeners para associações - CORRIGIDO
    userGroupsTableBody.addEventListener('click', (e) => {
        const renewButton = e.target.closest('.renew-user-btn');
        const removeButton = e.target.closest('.remove-user-btn');
        
        if (renewButton) {
            const userGroup = JSON.parse(renewButton.closest('tr').dataset.userGroup);
            const days = prompt('Quantos dias adicionais de acesso?', '30');
            if (days && !isNaN(days)) {
                // Agora passamos apenas o userGroup.id
                renewUserAccess(userGroup.id, parseInt(days));
            }
        }

        if (removeButton) {
            const userGroup = JSON.parse(removeButton.closest('tr').dataset.userGroup);
            removeUserFromGroup(userGroup.id, userGroup.user_name);
        }
    });

    saveGroupBtn.addEventListener('click', saveGroup);
    cancelGroupButton.addEventListener('click', resetGroupForm);
    addUserToGroupBtn.addEventListener('click', addUserToGroup);

    // --- INICIALIZAÇÃO ---
    const initializePage = async () => {
        await loadGroups();
        await loadUsersForSelect();
        await loadGroupsForSelect();
        await loadUserGroups();
        resetGroupForm();
    };

    initializePage();
});
