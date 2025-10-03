// profile.js - VERSÃO FINAL

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
    
    let currentUserProfile = null;
    let originalProfileData = null;

    // --- Funções ---

    const updateAvatarDisplay = (avatarUrl) => {
        const timestamp = `?t=${new Date().getTime()}`;
        if (avatarUrl) {
            if(currentAvatar) currentAvatar.src = avatarUrl + timestamp;
        } else {
            const userName = fullNameInput.value || 'Usuário';
            const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials )}&background=random&color=fff&bold=true`;
            if(currentAvatar) currentAvatar.src = defaultAvatar;
        }
        if(removeAvatarBtn) removeAvatarBtn.disabled = !avatarUrl;
    };

    const loadProfile = async () => {
        try {
            const response = await authenticatedFetch('/api/users/me');
            if (!response.ok) throw new Error('Não foi possível carregar o perfil.');
            
            currentUserProfile = await response.json();
            originalProfileData = { ...currentUserProfile };

            fullNameInput.value = currentUserProfile.full_name || '';
            jobTitleInput.value = currentUserProfile.job_title || '';
            emailInput.value = currentUserProfile.email || '';
            updateAvatarDisplay(currentUserProfile.avatar_url);
        } catch (error) {
            showStatus(error.message, 'error');
        }
    };

    const showStatus = (message, type = '') => {
        uploadStatus.textContent = message;
        uploadStatus.className = `status-message ${type}`;
        if (type === 'success') {
            setTimeout(() => showStatus('', ''), 5000);
        }
    };

    const handleAvatarUpload = async () => {
        const file = avatarFileInput.files[0];
        if (!file) return null;

        const session = await getSession();
        if (!session) throw new Error('Sessão não encontrada.');

        const fileExt = file.name.split('.').pop();
        const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(uploadData.path);
        return urlData.publicUrl;
    };

    const handleProfileUpdate = async () => {
        try {
            updateProfileBtn.disabled = true;
            updateProfileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Salvando...</span>';
            showStatus('Salvando alterações...', 'info');

            let avatarUrl = currentUserProfile?.avatar_url;
            if (avatarFileInput.files[0]) {
                avatarUrl = await handleAvatarUpload();
            }

            const updateData = {};
            if (fullNameInput.value.trim() !== originalProfileData.full_name) updateData.full_name = fullNameInput.value.trim();
            if (jobTitleInput.value.trim() !== (originalProfileData.job_title || '')) updateData.job_title = jobTitleInput.value.trim();
            if (avatarUrl !== currentUserProfile.avatar_url) updateData.avatar_url = avatarUrl;
            if (emailInput.value !== currentUserProfile.email) updateData.email = emailInput.value;
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

            if (!response.ok) throw await response.json();

            const updatedProfile = await response.json();
            showStatus('Perfil atualizado com sucesso!', 'success');

            // ==================================================================
            // --- CORREÇÃO FINAL: LIMPAR CACHES E DISPARAR EVENTO ---
            
            // 1. Limpa o cache de dados do usuário no localStorage
            console.log('🧹 Limpando cache do usuário (currentUser) do localStorage.');
            localStorage.removeItem('currentUser');

            // 2. Limpa o cache interno do auth.js
            if (typeof clearUserProfileCache === 'function') {
                clearUserProfileCache();
            }

            // 3. Dispara o evento para notificar outros componentes (como o user-menu)
            console.log('🚀 Disparando evento [profileUpdated].');
            window.dispatchEvent(new CustomEvent('profileUpdated'));
            // ==================================================================

            // Atualiza os dados locais na página de perfil
            currentUserProfile = { ...currentUserProfile, ...updatedProfile };
            originalProfileData = { ...currentUserProfile };
            updateAvatarDisplay(currentUserProfile.avatar_url);
            
            // Limpa campos sensíveis
            avatarFileInput.value = '';
            currentPasswordInput.value = '';
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';

        } catch (error) {
            const displayMessage = error.detail || error.message || 'Ocorreu um erro ao atualizar o perfil.';
            showStatus(`Erro: ${displayMessage}`, 'error');
        } finally {
            updateProfileBtn.disabled = false;
            updateProfileBtn.innerHTML = '<i class="fas fa-save"></i><span>Salvar Todas as Alterações</span>';
        }
    };

    // Inicialização
    if(document.getElementById('updateProfileBtn')) {
        loadProfile();
        updateProfileBtn.addEventListener('click', handleProfileUpdate);
    }
});
