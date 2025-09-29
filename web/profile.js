document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI ---
    const fullNameInput = document.getElementById('fullName');
    const jobTitleInput = document.getElementById('jobTitle');
    const avatarFileInput = document.getElementById('avatarFile');
    const updateProfileBtn = document.getElementById('updateProfileBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    const userAvatar = document.getElementById('userAvatar'); 

    let currentUserProfile = null;
    let currentSession = null;

    /**
     * Função auxiliar para extrair mensagens de erro de forma legível
     */
    const getErrorMessage = (error) => {
        if (typeof error === 'string') return error;
        if (error?.message) return error.message;
        if (error?.error) return error.error;
        if (error?.detail) return error.detail;
        if (error?.msg) return error.msg;
        
        // Para erros do Supabase
        if (error?.name === 'AuthApiError') return 'Erro de autenticação';
        if (error?.statusCode) return `Erro ${error.statusCode}: ${error.message}`;
        
        return 'Erro desconhecido';
    };

    /**
     * Carrega os dados do perfil do usuário logado e preenche o formulário.
     */
    const loadProfile = async () => {
        try {
            // Verifica se há sessão primeiro
            currentSession = await getSession();
            if (!currentSession) {
                throw new Error("Usuário não autenticado");
            }

            console.log('Carregando perfil para usuário:', currentSession.user.id);

            // Usa a função centralizada do auth.js para uma chamada segura
            const response = await authenticatedFetch('/api/users/me');

            if (!response.ok) {
                // Se não encontrar perfil, cria um perfil básico
                if (response.status === 404) {
                    console.log('Perfil não encontrado, criando perfil inicial...');
                    await createInitialProfile();
                    return;
                }
                
                const errorData = await response.json().catch(() => null);
                throw new Error(getErrorMessage(errorData) || `Erro ${response.status}: ${response.statusText}`);
            }

            currentUserProfile = await response.json();
            console.log('Perfil carregado:', currentUserProfile);

            // Preenche o formulário com os dados existentes
            fullNameInput.value = currentUserProfile.full_name || '';
            jobTitleInput.value = currentUserProfile.job_title || '';
            
            // Atualiza a imagem do avatar
            if (currentUserProfile.avatar_url && userAvatar) {
                userAvatar.src = currentUserProfile.avatar_url;
                // Adiciona tratamento de erro para imagem quebrada
                userAvatar.onerror = () => {
                    userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserProfile.full_name || currentSession.user.email || 'U')}`;
                };
            }

        } catch (error) {
            console.error('Erro ao carregar perfil:', error);
            uploadStatus.textContent = `Erro: ${getErrorMessage(error)}`;
            uploadStatus.style.color = 'var(--error)';
        }
    };

    /**
     * Cria um perfil inicial se não existir
     */
    const createInitialProfile = async () => {
        try {
            const userName = currentSession.user.email?.split('@')[0] || 'Usuário';
            const initialData = {
                full_name: userName,
                job_title: '',
                avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}`
            };

            console.log('Criando perfil inicial:', initialData);

            const response = await authenticatedFetch('/api/users/me', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(initialData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(getErrorMessage(errorData) || 'Falha ao criar perfil inicial');
            }

            console.log('Perfil inicial criado com sucesso');
            
            // Recarrega o perfil após criação
            await loadProfile();
            
        } catch (error) {
            console.error('Erro ao criar perfil inicial:', error);
            uploadStatus.textContent = `Erro ao criar perfil: ${getErrorMessage(error)}`;
            uploadStatus.style.color = 'var(--error)';
            throw error;
        }
    };

    /**
     * Lida com o upload da foto e a atualização dos dados do perfil.
     */
    const handleProfileUpdate = async () => {
        // Verifica novamente a sessão
        if (!currentSession) {
            currentSession = await getSession();
            if (!currentSession) {
                alert("Sessão não encontrada. Faça o login.");
                return;
            }
        }

        updateProfileBtn.disabled = true;
        updateProfileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Salvando...</span>';
        uploadStatus.textContent = '';

        try {
            const file = avatarFileInput.files[0];
            let avatarUrl = currentUserProfile?.avatar_url;

            // 1. Upload da foto se houver arquivo selecionado
            if (file) {
                if (file.size > 1 * 1024 * 1024) {
                    throw new Error("O arquivo da foto não pode exceder 1MB.");
                }
                
                uploadStatus.textContent = 'Enviando foto...';
                const fileExt = file.name.split('.').pop().toLowerCase();
                const fileName = `${Date.now()}.${fileExt}`;
                const filePath = `${currentSession.user.id}/${fileName}`;

                console.log('Fazendo upload do arquivo:', filePath);

                // Faz o upload do arquivo
                const { data: uploadData, error: uploadError } = await supabase
                    .storage
                    .from('avatars')
                    .upload(filePath, file, {
                        upsert: true,
                        cacheControl: '3600'
                    });

                if (uploadError) {
                    console.error('Erro no upload:', uploadError);
                    throw new Error(`Falha no upload: ${getErrorMessage(uploadError)}`);
                }

                // Obtém a URL pública
                const { data: urlData } = supabase
                    .storage
                    .from('avatars')
                    .getPublicUrl(uploadData.path);
                
                avatarUrl = urlData.publicUrl;
                console.log('Upload concluído, URL:', avatarUrl);
                uploadStatus.textContent = 'Foto enviada com sucesso!';
            }

            // 2. Prepara dados para atualização
            const updateData = {
                full_name: fullNameInput.value.trim() || null,
                job_title: jobTitleInput.value.trim() || null,
                avatar_url: avatarUrl || null
            };

            // Remove campos vazios
            Object.keys(updateData).forEach(key => {
                if (updateData[key] === null || updateData[key] === '') {
                    delete updateData[key];
                }
            });

            console.log('Enviando dados para atualização:', updateData);

            // 3. Atualiza o perfil
            const response = await authenticatedFetch('/api/users/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(getErrorMessage(errorData) || `Erro ${response.status}: Falha ao atualizar perfil`);
            }

            const updatedProfile = await response.json();
            console.log('Perfil atualizado:', updatedProfile);

            uploadStatus.textContent = 'Perfil atualizado com sucesso!';
            uploadStatus.style.color = 'var(--success)';
            
            // Atualiza a foto no menu
            if (userAvatar && avatarUrl) {
                userAvatar.src = avatarUrl + '?t=' + Date.now(); // Adiciona timestamp para evitar cache
            }

            // Atualiza os dados locais
            currentUserProfile = updatedProfile;

            // Limpa o campo de arquivo se o upload foi bem-sucedido
            if (file) {
                avatarFileInput.value = '';
            }

        } catch (error) {
            console.error('Erro ao atualizar perfil:', error);
            uploadStatus.textContent = `Erro: ${getErrorMessage(error)}`;
            uploadStatus.style.color = 'var(--error)';
        } finally {
            updateProfileBtn.disabled = false;
            updateProfileBtn.innerHTML = '<i class="fas fa-save"></i><span>Salvar Alterações</span>';
        }
    };

    // Event Listeners
    updateProfileBtn.addEventListener('click', handleProfileUpdate);

    // Adiciona listener para Enter nos campos
    [fullNameInput, jobTitleInput].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleProfileUpdate();
            }
        });
    });

    // Carrega os dados do perfil
    loadProfile();
});
