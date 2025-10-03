// profile.js - COMPLETO

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI ---
    const fullNameInput = document.getElementById('fullName');
    const jobTitleInput = document.getElementById('jobTitle');
    const emailInput = document.getElementById('email');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = documentgetElementById('confirmPassword');
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

    // --- Funções auxiliares ---

    const setupPasswordToggles = () => {
        const setupToggle = (toggleBtn, input) => {
            if (!toggleBtn || !input) return;
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

    const updateAvatarDisplay = (avatarUrl) => {
        if (avatarUrl) {
            const timestamp = Date.now();
            const avatarSrc = `${avatarUrl}?t=${timestamp}`;
            currentAvatar.src = avatarSrc;
            if (userAvatar) userAvatar.src = avatarSrc;
        } else {
            const userName = fullNameInput.value || 'Usuário';
            const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials )}&background=random&color=fff&bold=true`;
            currentAvatar.src = defaultAvatar;
            if (userAvatar) userAvatar.src = defaultAvatar;
        }
        removeAvatarBtn.disabled = !avatarUrl;
    };

    const checkForChanges = () => {
        if (!originalProfileData) return;

        const hasPersonalInfoChanged =
            fullNameInput.value !== originalProfileData.full_name ||
            jobTitleInput.value !== (originalProfileData.job_title || '');
        const hasEmailChanged = emailInput.value !== originalProfileData.email;
        const hasPasswordChanged = newPasswordInput.value.trim() !== '' || confirmPasswordInput.value.trim() !== '';
        const hasAvatarChanged = avatarFileInput.files.length > 0;

        hasUnsavedChanges = hasPersonalInfoChanged || hasEmailChanged || hasPasswordChanged || hasAvatarChanged;

        discardChangesBtn.style.display = hasUnsavedChanges ? 'block' : 'none';
        updateProfileBtn.disabled = !hasUnsavedChanges;
    };

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
        showStatus('', '');
    };

    const loadProfile = async () => {
        try {
            const response = await authenticatedFetch('/api/users/me');
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Não foi possível carregar o perfil.');
            }

            currentUserProfile = await response.json();
            originalProfileData = { ...currentUserProfile };

            fullNameInput.value = currentUserProfile.full_name || '';
            jobTitleInput.value = currentUserProfile.job_title || '';
            emailInput.value = currentUserProfile.email || '';
            updateAvatarDisplay(currentUserProfile.avatar_url);

        } catch (error) {
            console.error('Erro ao carregar perfil:', error);
            showStatus(error.message || 'Erro ao carregar perfil.', 'error');
        }
    };

    const showStatus = (message, type = '') => {
        uploadStatus.textContent = message;
        uploadStatus.className = `status-message ${type}`;
        if (type === 'success') {
            setTimeout(() => {
                if (uploadStatus.textContent === message) {
                    showStatus('', '');
                }
            }, 5000);
        }
    };

    const validateForm = () => {
        if (!fullNameInput.value.trim()) throw new Error('Nome completo é obrigatório.');
        if (!emailInput.value.trim()) throw new Error('E-mail é obrigatório.');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailInput.value)) throw new Error('Por favor, insira um e-mail válido.');

        if (newPasswordInput.value || confirmPasswordInput.value) {
            if (!currentPasswordInput.value) throw new Error('Senha atual é necessária para alterar a senha.');
            if (newPasswordInput.value.length < 6) throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
            if (newPasswordInput.value !== confirmPasswordInput.value) throw new Error('As senhas não coincidem.');
        }

        const file = avatarFileInput.files[0];
        if (file) {
            if (file.size > 1 * 1024 * 1024) throw new Error('O arquivo da foto não pode exceder 1MB.');
            const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!validTypes.includes(file.type)) throw new Error('Formato de arquivo não suportado. Use JPG, PNG ou GIF.');
        }
    };

    const handleAvatarUpload = async () => {
        const file = avatarFileInput.files[0];
        if (!file) return null;
        showStatus('Enviando foto...', 'info');

        try {
            const session = await getSession();
            if (!session) throw new Error('Sessão não encontrada.');
            if (typeof supabase === 'undefined') throw new Error('Cliente Supabase não disponível.');

            const fileExt = file.name.split('.').pop();
            const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(uploadData.path);
            showStatus('Foto enviada com sucesso!', 'success');
            return urlData.publicUrl;

        } catch (error) {
            console.error('Erro no upload:', error);
            throw new Error(`Falha no upload: ${error.message}`);
        }
    };

    const removeCurrentAvatar = async () => {
        if (!currentUserProfile?.avatar_url) return null;
        try {
            if (typeof supabase === 'undefined') return null;
            const url = new URL(currentUserProfile.avatar_url);
            const pathParts = url.pathname.split('/');
            const filePath = pathParts.slice(pathParts.indexOf('avatars') + 1).join('/');
            await supabase.storage.from('avatars').remove([filePath]);
            return null;
        } catch (error) {
            console.warn('Erro ao tentar remover avatar antigo:', error);
            return null;
        }
    };

    const handleProfileUpdate = async () => {
        try {
            validateForm();

            updateProfileBtn.disabled = true;
            updateProfileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Salvando...</span>';
            showStatus('Salvando alterações...', 'info');

            let avatarUrl = currentUserProfile?.avatar_url;
            if (avatarFileInput.files[0]) {
                avatarUrl = await handleAvatarUpload();
            } else if (removeAvatarBtn.disabled === false && !avatarFileInput.files[0]) {
                avatarUrl = await removeCurrentAvatar();
            }

            const updateData = {};
            if (fullNameInput.value.trim() !== originalProfileData.full_name) {
                updateData.full_name = fullNameInput.value.trim();
            }
            if (jobTitleInput.value.trim() !== (originalProfileData.job_title || '')) {
                updateData.job_title = jobTitleInput.value.trim();
            }
            if (avatarUrl !== currentUserProfile.avatar_url) {
                updateData.avatar_url = avatarUrl;
            }
            if (emailInput.value !== currentUserProfile.email) {
                updateData.email = emailInput.value;
            }
            if (newPasswordInput.value) {
                updateData.new_password = newPasswordInput.value;
                updateData.current_password = currentPasswordInput.value;
            }

            if (Object.keys(updateData).length === 0) {
                showStatus('Nenhuma alteração para salvar.', 'info');
                return;
            }

            const response = await authenticatedFetch('/api/users/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Erro da API:', errorData);
                throw errorData;
            }

            const updatedProfile = await response.json();
            showStatus('Perfil atualizado com sucesso!', 'success');

            currentUserProfile = { ...currentUserProfile, ...updatedProfile };
            originalProfileData = { ...currentUserProfile };
            
            updateAvatarDisplay(currentUserProfile.avatar_url);
            avatarFileInput.value = '';
            avatarPreview.style.display = 'none';
            currentPasswordInput.value = '';
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
            checkForChanges();

        } catch (error) {
            console.error('Erro ao atualizar perfil:', error);
            let displayMessage = error.message || 'Ocorreu um erro ao atualizar o perfil.';
            if (error.detail) {
                if (Array.isArray(error.detail)) {
                    displayMessage = error.detail.map(err => `${err.loc?.[1] || 'Campo'}: ${err.msg}`).join('; ');
                } else {
                    displayMessage = error.detail;
                }
            }
            showStatus(`Erro: ${displayMessage}`, 'error');
        } finally {
            updateProfileBtn.disabled = !hasUnsavedChanges;
            updateProfileBtn.innerHTML = '<i class="fas fa-save"></i><span>Salvar Todas as Alterações</span>';
        }
    };

    const initializeEventListeners = () => {
        [fullNameInput, jobTitleInput, emailInput, currentPasswordInput, newPasswordInput, confirmPasswordInput].forEach(input => {
            input.addEventListener('input', checkForChanges);
        });

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

        removeAvatarBtn.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja remover sua foto de perfil?')) {
                avatarFileInput.value = '';
                avatarPreview.style.display = 'none';
                updateAvatarDisplay(null);
                checkForChanges();
                showStatus('Foto será removida ao salvar as alterações.', 'info');
            }
        });

        updateProfileBtn.addEventListener('click', handleProfileUpdate);
        discardChangesBtn.addEventListener('click', discardChanges);
        setupPasswordToggles();
    };

    // Inicialização
    initializeEventListeners();
    loadProfile();
});
