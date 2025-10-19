document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI ---
    const tableBody = document.getElementById('usersTableBody');
    const saveButton = document.getElementById('saveUserBtn');
    const cancelButton = document.getElementById('cancelButton');
    const formTitle = document.getElementById('formTitle');
    const userIdInput = document.getElementById('userId');
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const roleSelect = document.getElementById('role');
    const permissionCards = document.querySelectorAll('.permission-card');
    const managedGroupsContainer = document.getElementById('managedGroupsContainer');
    const managedGroupsDiv = document.getElementById('managedGroups');

    // --- VARIÁVEIS GLOBAIS ---
    let allGroups = [];

    // --- LÓGICA DE NEGÓCIO ---

    // Função para carregar grupos
    const loadGroups = async () => {
        try {
            const response = await authenticatedFetch('/api/groups');
            if (response.ok) {
                allGroups = await response.json();
                renderGroupOptions();
            }
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
        }
    };

    // Função para renderizar opções de grupos
    const renderGroupOptions = () => {
        // Verifica se o elemento existe
        if (!managedGroupsDiv) {
            console.warn('Elemento managedGroupsDiv não encontrado');
            return;
        }

        managedGroupsDiv.innerHTML = '';
        allGroups.forEach(group => {
            const card = document.createElement('div');
            card.className = 'permission-card';
            card.innerHTML = `
                <div class="permission-header">
                    <div class="permission-icon"><i class="fas fa-layer-group"></i></div>
                    <div class="permission-name">${group.nome}</div>
                </div>
                <div class="permission-description">${group.descricao || 'Sem descrição'} - ${group.dias_acesso} dias de acesso</div>
                <span class="category-indicator configuracao">Grupo</span>
                <div class="permission-checkbox"></div>
            `;
            card.dataset.groupId = group.id;
            managedGroupsDiv.appendChild(card);
        });

        // Adicionar event listener para os cards de grupo
        managedGroupsDiv.querySelectorAll('.permission-card').forEach(card => {
            card.addEventListener('click', () => {
                card.classList.toggle('selected');
            });
        });
    };

    // Função para obter grupos selecionados
    const getSelectedManagedGroups = () => {
        if (!managedGroupsDiv) return [];

        return Array.from(managedGroupsDiv.querySelectorAll('.permission-card.selected'))
            .map(card => parseInt(card.dataset.groupId));
    };

    // Função para definir grupos selecionados
    const setSelectedManagedGroups = (groupIds) => {
        if (!managedGroupsDiv) return;

        managedGroupsDiv.querySelectorAll('.permission-card').forEach(card => {
            const groupId = parseInt(card.dataset.groupId);
            card.classList.toggle('selected', groupIds.includes(groupId));
        });
    };

    // Função para obter as permissões selecionadas
    const getSelectedPermissions = () => {
        return Array.from(permissionCards)
            .filter(card => card.classList.contains('selected'))
            .map(card => card.dataset.permission);
    };

    // Função para definir as permissões selecionadas
    const setSelectedPermissions = (permissions) => {
        permissionCards.forEach(card => {
            card.classList.toggle('selected', permissions.includes(card.dataset.permission));
        });
    };

    // Adicionar event listeners para os cards de permissão
    permissionCards.forEach(card => {
        card.addEventListener('click', () => {
            card.classList.toggle('selected');
        });
    });

    // Event listener para mudança de role
    roleSelect.addEventListener('change', () => {
        const isGroupAdmin = roleSelect.value === 'group_admin';
        
        // Mostrar ou ocultar o container de grupos gerenciados
        if (managedGroupsContainer) {
            managedGroupsContainer.style.display = isGroupAdmin ? 'block' : 'none';
        }
        
        // Se for admin geral, selecionar todas as permissões automaticamente
        if (roleSelect.value === 'admin') {
            permissionCards.forEach(card => {
                card.classList.add('selected');
            });
        }
    });

    const loadUsers = async () => {
        try {
            const response = await authenticatedFetch('/api/users');
            
            if (!response.ok) {
                throw new Error('Erro ao carregar usuários');
            }
            
            const users = await response.json();
            
            tableBody.innerHTML = '';
            users.forEach(user => {
                const row = document.createElement('tr');
                row.dataset.user = JSON.stringify(user);

                // Determinar texto do nível
                let roleText = 'Usuário';
                if (user.role === 'admin') roleText = 'Admin Geral';
                if (user.role === 'group_admin') roleText = 'Admin de Grupo';

                row.innerHTML = `
                    <td>${user.full_name || 'N/A'}</td>
                    <td>${user.email || 'N/A'}</td>
                    <td class="password-cell">
                        ${user.plain_password ? `<span class="pwd-hidden">••••••••</span><span class="pwd-real" style="display:none;">${user.plain_password}</span>` : '<span class="pwd-hidden">Oculto</span>'}
                        ${user.plain_password ? '<button class="btn-icon reveal-pwd" title="Revelar senha"><i class="fas fa-eye"></i></button>' : ''}
                    </td>
                    <td>${roleText}</td>
                    <td>${(user.allowed_pages || []).length} permissões</td>
                    <td class="actions">
                        <button class="btn-icon edit-btn" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon delete-btn" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            alert('Não foi possível carregar a lista de usuários.');
        }
    };

    const resetForm = () => {
        formTitle.textContent = 'Adicionar Novo Usuário';
        userIdInput.value = '';
        fullNameInput.value = '';
        emailInput.value = '';
        passwordInput.value = '';
        emailInput.disabled = false;
        passwordInput.disabled = false;
        passwordInput.placeholder = 'Obrigatório para novos usuários';
        roleSelect.value = 'user';
        setSelectedPermissions([]);
        setSelectedManagedGroups([]);
        
        // Esconder o container de grupos gerenciados
        if (managedGroupsContainer) {
            managedGroupsContainer.style.display = 'none';
        }
        
        saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar';
        cancelButton.style.display = 'none';
    };

    const populateFormForEdit = (user) => {
        formTitle.textContent = `Editando Usuário: ${user.full_name}`;
        userIdInput.value = user.id;
        fullNameInput.value = user.full_name;
        emailInput.value = user.email;
        emailInput.disabled = true;
        passwordInput.value = '';
        passwordInput.placeholder = 'Deixe em branco para não alterar';
        passwordInput.disabled = true;
        roleSelect.value = user.role;
        
        setSelectedPermissions(user.allowed_pages || []);
        
        // Configurar grupos gerenciados se for admin de grupo
        if (user.role === 'group_admin' && user.managed_groups) {
            if (managedGroupsContainer) {
                managedGroupsContainer.style.display = 'block';
            }
            setSelectedManagedGroups(user.managed_groups);
        } else {
            if (managedGroupsContainer) {
                managedGroupsContainer.style.display = 'none';
            }
        }
        
        saveButton.innerHTML = '<i class="fas fa-save"></i> Atualizar';
        cancelButton.style.display = 'inline-flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const saveUser = async () => {
        const id = userIdInput.value;
        const full_name = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const role = roleSelect.value;
        const allowed_pages = getSelectedPermissions();
        const managed_groups = role === 'group_admin' ? getSelectedManagedGroups() : [];

        if (!full_name) {
            alert('Nome completo é obrigatório.');
            return;
        }

        // Validações específicas para admin de grupo
        if (role === 'group_admin' && managed_groups.length === 0) {
            alert('Admin de grupo deve ter pelo menos um grupo associado.');
            return;
        }

        const isUpdating = !!id;
        
        if (!isUpdating && (!email || !password)) {
            alert('Email e Senha são obrigatórios para novos usuários.');
            return;
        }

        const url = isUpdating ? `/api/users/${id}` : '/api/users';
        const method = isUpdating ? 'PUT' : 'POST';
        
        let body;
        if (isUpdating) {
            // CORREÇÃO: Montar objeto corretamente para atualização
            body = JSON.stringify({ 
                full_name, 
                role, 
                allowed_pages, 
                managed_groups 
            });
            
            console.log('Enviando atualização:', body); // Debug
        } else {
            body = JSON.stringify({ 
                email, 
                password, 
                full_name, 
                role, 
                allowed_pages, 
                managed_groups 
            });
        }

        const originalButtonText = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = isUpdating ? 'Atualizando...' : 'Criando...';

        try {
            const response = await authenticatedFetch(url, { 
                method, 
                body,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                let errorMessage = 'Erro ao salvar usuário';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                    console.error('Detalhes do erro:', errorData); // Debug
                } catch (e) {
                    errorMessage = `Erro ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }
            
            alert(`Usuário ${isUpdating ? 'atualizado' : 'criado'} com sucesso!`);
            resetForm();
            loadUsers();
        } catch (error) {
            console.error('Erro completo ao salvar usuário:', error);
            alert(`Erro: ${error.message}`);
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonText;
        }
    };

    const deleteUser = async (id, userName) => {
        if (!confirm(`Tem certeza que deseja excluir o usuário "${userName}"? Esta ação não pode ser desfeita.`)) return;

        try {
            const response = await authenticatedFetch(`/api/users/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Falha ao excluir o usuário.');
            }
            alert('Usuário excluído com sucesso!');
            loadUsers();
        } catch (error) {
            console.error('Erro ao excluir usuário:', error);
            alert(error.message);
        }
    };

    // --- EVENT LISTENERS ---
    
    tableBody.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-btn');
        const deleteButton = e.target.closest('.delete-btn');
        
        if (editButton) {
            const user = JSON.parse(editButton.closest('tr').dataset.user);
            populateFormForEdit(user);
        }

        if (deleteButton) {
            const user = JSON.parse(deleteButton.closest('tr').dataset.user);
            deleteUser(user.id, user.full_name);
        }

        const revealBtn = e.target.closest('.reveal-pwd');
        if (revealBtn) {
            const cell = revealBtn.closest('.password-cell');
            const hiddenSpan = cell.querySelector('.pwd-hidden');
            const realSpan = cell.querySelector('.pwd-real');

            if (!realSpan) return;

            const isShown = realSpan.style.display === 'inline' || realSpan.style.display === 'block';
            if (isShown) {
                realSpan.style.display = 'none';
                hiddenSpan.style.display = 'inline';
                revealBtn.innerHTML = '<i class="fas fa-eye"></i>';
            } else {
                realSpan.style.display = 'inline';
                hiddenSpan.style.display = 'none';
                revealBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            }
        }
    });
    
    saveButton.addEventListener('click', saveUser);
    cancelButton.addEventListener('click', resetForm);
    
    // Inicialização da página
    const initializePage = async () => {
        await loadGroups();
        await loadUsers();
        resetForm();
    };

    initializePage();
});
