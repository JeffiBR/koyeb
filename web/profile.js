document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI ---
    const fullNameInput = document.getElementById('fullName');
    const jobTitleInput = document.getElementById('jobTitle');
    const avatarFileInput = document.getElementById('avatarFile');
    const updateProfileBtn = document.getElementById('updateProfileBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    // A imagem do avatar na barra superior
    const userAvatar = document.getElementById('userAvatar'); 

    let currentUserProfile = null;

    /**
     * Carrega os dados do perfil do usuário logado e preenche o formulário.
     */
    const loadProfile = async () => {
        try {
            // Usa a função centralizada do auth.js para uma chamada segura
            const response = await authenticatedFetch('/api/users/me');

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Não foi possível carregar o perfil.');
            }

            currentUserProfile = await response.json();

            // Preenche o formulário com os dados existentes
            fullNameInput.value = currentUserProfile.full_name || '';
            jobTitleInput.value = currentUserProfile.job_title || '';
            if (currentUserProfile.avatar_url && userAvatar) {
                userAvatar.src = currentUserProfile.avatar_url;
            }

        } catch (error) {
            console.error(error);
            uploadStatus.textContent = error.message;
            uploadStatus.style.color = 'var(--error)';
        }
    };

    /**
     * Lida com o upload da foto e a atualização dos dados do perfil.
     */
    const handleProfileUpdate = async () => {
        const session = await getSession(); // Pega a sessão para o ID do usuário
        if (!session) {
            alert("Sessão não encontrada. Faça o login.");
            return;
        }

        updateProfileBtn.disabled = true;
        updateProfileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Salvando...</span>';
        uploadStatus.textContent = '';

        try {
            const file = avatarFileInput.files[0];
            let avatarUrl = currentUserProfile.avatar_url; // Mantém a URL antiga por padrão

            // 1. Se um novo arquivo foi selecionado, faz o upload para o Supabase Storage
            if (file) {
                if (file.size > 1 * 1024 * 1024) { // Limite de 1MB
                    throw new Error("O arquivo da foto não pode exceder 1MB.");
                }
                uploadStatus.textContent = 'Enviando foto...';
                const fileExt = file.name.split('.').pop();
                const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

                // Usa a biblioteca do Supabase diretamente para o upload
                const { data: uploadData, error: uploadError } = await supabase
                    .storage
                    .from('avatars') // O nome do seu bucket no Supabase
                    .upload(filePath, file);

                if (uploadError) {
                    throw uploadError;
                }

                // Pega a URL pública da imagem recém-enviada
                const { data: urlData } = supabase
                    .storage
                    .from('avatars')
                    .getPublicUrl(uploadData.path);
                
                avatarUrl = urlData.publicUrl;
                uploadStatus.textContent = 'Foto enviada com sucesso!';
            }

            // 2. Monta o corpo da requisição para atualizar o perfil no banco de dados
            const updateData = {
                full_name: fullNameInput.value.trim(),
                job_title: jobTitleInput.value.trim(),
                avatar_url: avatarUrl
            };

            // 3. Envia os dados para a nossa API para salvar no banco
            const response = await authenticatedFetch('/api/users/me', {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Falha ao atualizar o perfil.');
            }

            uploadStatus.textContent = 'Perfil atualizado com sucesso!';
            uploadStatus.style.color = 'var(--success)';
            
            // Atualiza a foto no menu da barra superior em tempo real
            if (userAvatar && avatarUrl) {
                userAvatar.src = avatarUrl; 
            }

            // Limpa o cache do perfil para forçar a busca de dados novos na próxima navegação
            currentUserProfile = null; 

        } catch (error) {
            console.error('Erro ao atualizar perfil:', error);
            uploadStatus.textContent = `Erro: ${error.message}`;
            uploadStatus.style.color = 'var(--error)';
        } finally {
            updateProfileBtn.disabled = false;
            updateProfileBtn.innerHTML = '<i class="fas fa-save"></i><span>Salvar Alterações</span>';
        }
    };

    updateProfileBtn.addEventListener('click', handleProfileUpdate);

    // Carrega os dados do perfil assim que a página é aberta
    loadProfile();
});
