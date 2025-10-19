// profile.js - VERSÃO FINAL COM EFEITOS AVANÇADOS

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
    
    // Elementos da nova seção de foto de perfil
    const uploadArea = document.getElementById('uploadArea');
    const browseBtn = document.getElementById('browseBtn');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileRemove = document.getElementById('fileRemove');
    const previewContainer = document.getElementById('previewContainer');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const avatarOverlay = document.getElementById('avatarOverlay');
    
    let currentUserProfile = null;
    let originalProfileData = null;
    let isRemoveAnimating = false;

    // --- FUNÇÕES PRINCIPAIS ---

    const updateAvatarDisplay = (avatarUrl) => {
        const timestamp = `?t=${new Date().getTime()}`;
        if (avatarUrl) {
            if(currentAvatar) currentAvatar.src = avatarUrl + timestamp;
        } else {
            const userName = fullNameInput.value || 'Usuário';
            const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&color=fff&bold=true`;
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
            
            // Atualizar informações do perfil no cabeçalho
            updateProfileDisplay();
        } catch (error) {
            showStatus(error.message, 'error');
        }
    };

    const updateProfileDisplay = () => {
        const fullName = document.getElementById('fullName').value || 'Usuário';
        const jobTitle = document.getElementById('jobTitle').value || 'Cargo/Função';
        const email = document.getElementById('email').value || 'seu.email@exemplo.com';
        
        document.getElementById('profileDisplayName').textContent = fullName;
        document.getElementById('profileDisplayRole').textContent = jobTitle;
        document.getElementById('profileDisplayEmail').textContent = email;
        
        // Atualizar avatar no cabeçalho
        const avatarUrl = document.getElementById('currentAvatar').src;
        document.getElementById('userAvatar').src = avatarUrl;
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

            // Limpar caches e disparar evento
            localStorage.removeItem('currentUser');
            if (typeof clearUserProfileCache === 'function') {
                clearUserProfileCache();
            }
            window.dispatchEvent(new CustomEvent('profileUpdated'));

            // Atualizar dados locais
            currentUserProfile = { ...currentUserProfile, ...updatedProfile };
            originalProfileData = { ...currentUserProfile };
            updateAvatarDisplay(currentUserProfile.avatar_url);
            updateProfileDisplay();
            
            // Limpar campos sensíveis
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

    // --- FUNCIONALIDADES DA SEÇÃO DE FOTO DE PERFIL ---

    // Abrir seletor de arquivo
    browseBtn.addEventListener('click', () => avatarFileInput.click());
    uploadArea.addEventListener('click', (e) => {
        if (e.target === uploadArea || e.target.classList.contains('upload-icon') || 
            e.target.classList.contains('upload-text') || e.target.closest('.upload-text')) {
            avatarFileInput.click();
        }
    });

    // Abrir seletor de arquivo ao clicar no overlay do avatar
    avatarOverlay.addEventListener('click', () => avatarFileInput.click());

    // Drag and drop functionality
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        uploadArea.classList.add('dragover');
    }

    function unhighlight() {
        uploadArea.classList.remove('dragover');
    }

    uploadArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    // Processar arquivo selecionado
    avatarFileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            
            // Verificar tipo de arquivo
            const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!validTypes.includes(file.type)) {
                showError('Tipo de arquivo não suportado. Use JPG, PNG ou GIF.');
                return;
            }
            
            // Verificar tamanho do arquivo (1MB)
            if (file.size > 1024 * 1024) {
                showError('Arquivo muito grande. O tamanho máximo é 1MB.');
                return;
            }
            
            // Atualizar informações do arquivo
            fileName.textContent = file.name;
            fileSize.textContent = formatFileSize(file.size);
            fileInfo.style.display = 'flex';
            
            // Mostrar pré-visualização
            const reader = new FileReader();
            reader.onload = function(e) {
                previewImage.src = e.target.result;
                previewContainer.classList.add('show');
            };
            reader.readAsDataURL(file);
            
            // Simular upload
            simulateUpload();
        }
    }

    // Formatar tamanho do arquivo
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        else return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // Simular processo de upload
    function simulateUpload() {
        progressBar.style.display = 'block';
        let width = 0;
        
        const interval = setInterval(() => {
            if (width >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    progressBar.style.display = 'none';
                    successMessage.style.display = 'flex';
                    setTimeout(() => {
                        successMessage.style.display = 'none';
                    }, 3000);
                }, 500);
            } else {
                width += Math.random() * 10;
                if (width > 100) width = 100;
                progressFill.style.width = width + '%';
            }
        }, 100);
    }

    // Remover arquivo selecionado
    fileRemove.addEventListener('click', function() {
        avatarFileInput.value = '';
        fileInfo.style.display = 'none';
        previewContainer.classList.remove('show');
        errorMessage.style.display = 'none';
    });

    // --- EFEITOS AVANÇADOS PARA O BOTÃO REMOVER FOTO ---

    // Função para animar o botão de remoção
    function animateRemoveButton(button, type = 'warning') {
        isRemoveAnimating = true;
        button.classList.add(type);
        setTimeout(() => {
            button.classList.remove(type);
            isRemoveAnimating = false;
        }, 800);
    }

    // Função para mostrar confirmação visual
    function showRemoveConfirmation(button) {
        const originalText = button.innerHTML;
        const originalClass = button.className;
        
        button.innerHTML = '<i class="fas fa-check"></i> Foto Removida!';
        button.classList.add('confirmed');
        
        setTimeout(() => {
            button.innerHTML = originalText;
            button.className = originalClass;
        }, 2000);
    }

    // Remover foto de perfil com efeitos avançados
    removeAvatarBtn.addEventListener('click', function() {
        // Animação de aviso
        animateRemoveButton(this, 'warning');
        
        // Tooltip de confirmação
        this.classList.add('remove-btn-tooltip');
        
        setTimeout(() => {
            if (confirm('Tem certeza que deseja remover sua foto de perfil?\nEsta ação não pode ser desfeita.')) {
                // Animação de loading
                this.classList.add('loading');
                
                setTimeout(() => {
                    avatarFileInput.value = '';
                    fileInfo.style.display = 'none';
                    previewContainer.classList.remove('show');
                    previewImage.src = 'https://via.placeholder.com/150/0b1020/4f46e5?text=Preview';
                    
                    // Mostrar confirmação visual
                    showRemoveConfirmation(this);
                    
                    // Atualizar avatar para o padrão
                    updateAvatarDisplay(null);
                    updateProfileDisplay();
                    
                    // Remover classes de animação
                    this.classList.remove('loading');
                    this.classList.remove('remove-btn-tooltip');
                    
                }, 1000);
            } else {
                this.classList.remove('remove-btn-tooltip');
            }
        }, 600);
    });

    // Efeitos de hover avançados
    removeAvatarBtn.addEventListener('mouseenter', function() {
        if (!isRemoveAnimating) {
            this.style.transform = 'translateY(-2px) scale(1.02)';
        }
    });

    removeAvatarBtn.addEventListener('mouseleave', function() {
        if (!isRemoveAnimating) {
            this.style.transform = 'translateY(0) scale(1)';
        }
    });

    // Mostrar erro
    function showError(message) {
        errorText.textContent = message;
        errorMessage.style.display = 'flex';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    }

    // --- INICIALIZAÇÃO ---

    // Adicionar event listeners para atualizar o cabeçalho
    fullNameInput.addEventListener('input', updateProfileDisplay);
    jobTitleInput.addEventListener('input', updateProfileDisplay);
    emailInput.addEventListener('input', updateProfileDisplay);

    // Inicialização principal
    if(document.getElementById('updateProfileBtn')) {
        loadProfile();
        updateProfileBtn.addEventListener('click', handleProfileUpdate);
    }

    // Toggle para mostrar/ocultar senhas
    const togglePasswordButtons = [
        { button: document.getElementById('toggleCurrentPassword'), input: currentPasswordInput },
        { button: document.getElementById('toggleNewPassword'), input: newPasswordInput },
        { button: document.getElementById('toggleConfirmPassword'), input: confirmPasswordInput }
    ];

    togglePasswordButtons.forEach(({ button, input }) => {
        if (button && input) {
            button.addEventListener('click', function() {
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                this.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
            });
        }
    });
});
