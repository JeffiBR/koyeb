document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI ---
    const fullNameInput = document.getElementById('fullName');
    const jobTitleInput = document.getElementById('jobTitle');
    const emailInput = document.getElementById('email');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const avatarFileInput = document.getElementById('avatarFile');
    const currentAvatar = document.getElementById('currentAvatar');
    const removeAvatarBtn = document.getElementById('removeAvatarBtn');
    const avatarPreview = document.getElementById('avatarPreview');
    const previewImage = document.getElementById('previewImage');
    const updateProfileBtn = document.getElementById('updateProfileBtn');
    const discardChangesBtn = document.getElementById('discardChangesBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    const userAvatar = document.getElementById('userAvatar');

    // Botões para mostrar/ocultar senha
    const toggleCurrentPassword = document.getElementById('toggleCurrentPassword');
    const toggleNewPassword = document.getElementById('toggleNewPassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');

    let currentUserProfile = null;
    let originalProfileData = null;
    let hasUnsavedChanges = false;

    /**
     * Configura os toggles de visibilidade de senha
     */
    const setupPasswordToggles = () => {
        const setupToggle = (toggleBtn, input) => {
            toggleBtn.addEventListener('click', () => {
                const type = input.type === 'password' ? 'text' : 'password';
                input.type = type;
                toggleBtn.innerHTML = type === 'password' ? 
                    '<i class="fas fa-eye"></i>' : 
                    '<i class="fas fa-eye-slash"></i>';
            });
        };

        setupToggle(toggleCurrentPassword, currentPasswordInput);
        setupToggle(toggleNewPassword, newPasswordInput);
        setupToggle(toggleConfirmPassword, confirmPasswordInput);
    };

    /**
     * Atualiza a visualização do avatar
     */
    const updateAvatarDisplay = (avatarUrl) => {
        const timestamp = Date.now();
        const avatarSrc = avatarUrl ? `${avatarUrl}?t=${timestamp}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(fullNameInput.value || 'U')}`;
        
        currentAvatar.src = avatarSrc;
        if (userAvatar) {
            userAvatar.src = avatarSrc;
        }
        
        // Habilita/desabilita botão de remover
        removeAvatarBtn.disabled = !avatarUrl;
    };

    /**
     * Verifica se há alterações não salvas
     */
    const checkForChanges = () => {
        if (!originalProfileData) return;

        const hasPersonalInfoChanged = 
            fullNameInput.value !== originalProfileData.full_name ||
            jobTitleInput.value !== originalProfileData.job_title;

        const hasEmailChanged = emailInput.value !== originalProfileData.email;

        const hasPasswordChanged = 
            newPasswordInput.value.trim() !== '' ||
            confirmPasswordInput.value.trim() !== '';

        const hasAvatarChanged = avatarFileInput.files.length > 0;

        hasUnsavedChanges = hasPersonalInfoChanged || hasEmailChanged || hasPasswordChanged || hasAvatarChanged;
        
        discardChangesBtn.style.display = hasUnsavedChanges ? 'block' : 'none';
        updateProfileBtn.disabled = !hasUnsavedChanges;
    };

    /**
     * Restaura os dados originais
     */
    const discardChanges = () => {
        if (!originalProfileData) return;

        fullNameInput.value = originalProfileData.full_name || '';
        jobTitleInput.value = originalProfileData.job_title || '';
        emailInput.value = originalProfileData.email || '';
        
        currentPasswordInput.value = '';
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        
        avatarFileInput.value = '';
        avatarPreview.style.display = 'none';
        
        updateAvatarDisplay(originalProfileData.avatar_url);
        
        hasUnsavedChanges = false;
        discardChangesBtn.style.display = 'none';
        updateProfileBtn.disabled = false;
        
        uploadStatus.textContent = '';
        uploadStatus.className = 'status-message';
    };

    /**
     * Carrega os dados do perfil do usuário logado
     */
    const loadProfile = async () => {
        try {
            const response = await authenticatedFetch('/api/users/me');

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Não foi possível carregar o perfil.');
            }

            currentUserProfile = await response.json();
            originalProfileData = { ...currentUserProfile };

            // Preenche o formulário
            fullNameInput.value = currentUserProfile.full_name || '';
            jobTitleInput.value = currentUserProfile.job_title || '';
            emailInput.value = currentUserProfile.email || '';
            
            // Atualiza avatar
            updateAvatarDisplay(currentUserProfile.avatar_url);

        } catch (error) {
            console.error('Erro ao carregar perfil:', error);
            showStatus(error.message || 'Erro ao carregar perfil.', 'error');
        }
    };

    /**
     * Exibe mensagens de status
     */
    const showStatus = (message, type = 'info') => {
        uploadStatus.textContent = message;
        uploadStatus.className = `status-message ${type}`;
    };

    /**
     * Valida os dados do formulário
     */
    const validateForm = () => {
        // Validação básica
        if (!fullNameInput.value.trim()) {
            throw new Error('Nome completo é obrigatório.');
        }

        if (!emailInput.value.trim()) {
            throw new Error('E-mail é obrigatório.');
        }

        // Validação de e-mail
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailInput.value)) {
            throw new Error('Por favor, insira um e-mail válido.');
        }

        // Validação de senha
        if (newPasswordInput.value || confirmPasswordInput.value) {
            if (!currentPasswordInput.value) {
                throw new Error('Senha atual é necessária para alterar a senha.');
            }

            if (newPasswordInput.value.length < 6) {
                throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
            }

            if (newPasswordInput.value !== confirmPasswordInput.value) {
                throw new Error('As senhas não coincidem.');
            }
        }

        // Validação do arquivo de avatar
        const file = avatarFileInput.files[0];
        if (file) {
            if (file.size > 1 * 1024 * 1024) {
                throw new Error('O arquivo da foto não pode exceder 1MB.');
            }

            const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!validTypes.includes(file.type)) {
                throw new Error('Formato de arquivo não suportado. Use JPG, PNG ou GIF.');
            }
        }
    };

    /**
     * Processa o upload da foto de perfil
     */
    const handleAvatarUpload = async (session) => {
        const file = avatarFileInput.files[0];
        if (!file) return currentUserProfile?.avatar_url;

        showStatus('Enviando foto...', 'info');

        const fileExt = file.name.split('.').pop();
        const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            throw uploadError;
        }

        const { data: urlData } = supabase
            .storage
            .from('avatars')
            .getPublicUrl(uploadData.path);

        showStatus('Foto enviada com sucesso!', 'success');
        return urlData.publicUrl;
    };

    /**
     * Remove a foto de perfil atual
     */
    const removeCurrentAvatar = async (session) => {
        if (!currentUserProfile?.avatar_url) return null;

        try {
            // Extrai o caminho do arquivo da URL
            const url = new URL(currentUserProfile.avatar_url);
            const pathParts = url.pathname.split('/');
            const filePath = pathParts.slice(pathParts.indexOf('avatars') + 1).join('/');

            const { error } = await supabase
                .storage
                .from('avatars')
                .remove([filePath]);

            if (error) {
                console.warn('Não foi possível remover o arquivo antigo:', error);
            }
        } catch (error) {
            console.warn('Erro ao tentar remover avatar antigo:', error);
        }

        return null;
    };

    /**
     * Atualiza o e-mail do usuário
     */
    const updateUserEmail = async (session, newEmail) => {
        if (newEmail === currentUserProfile.email) return;

        const { error } = await supabase.auth.updateUser({
            email: newEmail
        });

        if (error) throw error;

        // Note: O Supabase enviará um e-mail de confirmação para o novo e-mail
        showStatus('E-mail alterado. Verifique seu novo e-mail para confirmar a alteração.', 'info');
    };

    /**
     * Atualiza a senha do usuário
     */
    const updateUserPassword = async (currentPassword, newPassword) => {
        if (!newPassword) return;

        // Para alterar a senha, precisamos reautenticar o usuário
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: currentUserProfile.email,
            password: currentPassword
        });

        if (signInError) {
            throw new Error('Senha atual incorreta.');
        }

        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (updateError) throw updateError;

        showStatus('Senha alterada com sucesso!', 'success');
    };

    /**
     * Lida com a atualização completa do perfil
     */
    const handleProfileUpdate = async () => {
        const session = await getSession();
        if (!session) {
            showStatus('Sessão não encontrada. Faça o login.', 'error');
            return;
        }

        try {
            // Valida o formulário
            validateForm();

            updateProfileBtn.disabled = true;
            updateProfileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Salvando...</span>';
            showStatus('Salvando alterações...', 'info');

            let avatarUrl = currentUserProfile?.avatar_url;

            // Processa remoção do avatar
            if (removeAvatarBtn.disabled === false && !avatarFileInput.files[0]) {
                avatarUrl = await removeCurrentAvatar(session);
            }

            // Processa upload de novo avatar
            if (avatarFileInput.files[0]) {
                avatarUrl = await handleAvatarUpload(session);
            }

            // Atualiza e-mail se necessário
            if (emailInput.value !== currentUserProfile.email) {
                await updateUserEmail(session, emailInput.value);
            }

            // Atualiza senha se fornecida
            if (newPasswordInput.value) {
                await updateUserPassword(currentPasswordInput.value, newPasswordInput.value);
            }

            // Atualiza perfil no banco de dados
            const updateData = {
                full_name: fullNameInput.value.trim(),
                job_title: jobTitleInput.value.trim(),
                avatar_url: avatarUrl
            };

            const response = await authenticatedFetch('/api/users/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw errorData;
            }

            showStatus('Perfil atualizado com sucesso!', 'success');
            
            // Atualiza a exibição
            updateAvatarDisplay(avatarUrl);
            
            // Recarrega os dados para sincronizar
            await loadProfile();

        } catch (error) {
            console.error('Erro ao atualizar perfil:', error);
            
            let displayMessage = error.message || 'Ocorreu um erro ao atualizar o perfil.';
            
            if (error.detail) {
                if (Array.isArray(error.detail)) {
                    displayMessage = error.detail.map(err => 
                        `${err.loc?.[1] || 'Campo'}: ${err.msg}`
                    ).join('; ');
                } else {
                    displayMessage = error.detail;
                }
            }

            showStatus(`Erro: ${displayMessage}`, 'error');
        } finally {
            updateProfileBtn.disabled = false;
            updateProfileBtn.innerHTML = '<i class="fas fa-save"></i><span>Salvar Todas as Alterações</span>';
        }
    };

    /**
     * Inicializa os event listeners
     */
    const initializeEventListeners = () => {
        // Event listeners para inputs
        [fullNameInput, jobTitleInput, emailInput, currentPasswordInput, newPasswordInput, confirmPasswordInput].forEach(input => {
            input.addEventListener('input', checkForChanges);
        });

        // Avatar file input
        avatarFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImage.src = e.target.result;
                    avatarPreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                avatarPreview.style.display = 'none';
            }
            checkForChanges();
        });

        // Botão remover avatar
        removeAvatarBtn.addEventListener('click', () => {
            avatarFileInput.value = '';
            avatarPreview.style.display = 'none';
            updateAvatarDisplay(null);
            checkForChanges();
        });

        // Botões de ação
        updateProfileBtn.addEventListener('click', handleProfileUpdate);
        discardChangesBtn.addEventListener('click', discardChanges);

        // Configura toggles de senha
        setupPasswordToggles();
    };

    // Inicialização
    initializeEventListeners();
    loadProfile();
});
