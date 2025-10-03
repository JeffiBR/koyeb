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

    // --- LÓGICA DE NEGÓCIO ---

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

                row.innerHTML = `
                    <td>${user.full_name || 'N/A'}</td>
                    <td>${user.email || 'N/A'}</td>
                    <td class="password-cell">
                        ${user.plain_password ? `<span class="pwd-hidden">••••••••</span><span class="pwd-real" style="display:none;">${user.plain_password}</span>` : '<span class="pwd-hidden">Oculto</span>'}
                        ${user.plain_password ? '<button class="btn-icon reveal-pwd" title="Revelar senha"><i class="fas fa-eye"></i></button>' : ''}
                    </td>
                    <td>${user.role === 'admin' ? 'Admin Geral' : 'Usuário'}</td>
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

        if (!full_name) {
            alert('Nome completo é obrigatório.');
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
            body = JSON.stringify({ full_name, role, allowed_pages });
        } else {
            body = JSON.stringify({ email, password, full_name, role, allowed_pages });
        }

        const originalButtonText = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = isUpdating ? 'Atualizando...' : 'Criando...';

        try {
            const response = await authenticatedFetch(url, { method, body });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao salvar usuário');
            }
            
            alert(`Usuário ${isUpdating ? 'atualizado' : 'criado'} com sucesso!`);
            resetForm();
            loadUsers();
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
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
    loadUsers();

    // Menu mobile
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('show');
        });
    }
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('show');
        });
    }

    // Toggle do menu do usuário
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    
    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });
        
        document.addEventListener('click', () => {
            userDropdown.classList.remove('show');
        });
    }

    // Toggle do tema
    const themeToggle = document.getElementById('themeToggle');
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const icon = themeToggle.querySelector('i');
            if (document.body.classList.contains('light-mode')) {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            } else {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            }
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            alert('Logout realizado com sucesso!');
            window.location.href = '/login.html';
        });
    }
});
