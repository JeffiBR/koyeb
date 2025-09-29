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
     * Função auxiliar para formatar o nome do campo (ex: full_name -> Full Name)
     */
    const formatFieldName = (name) => {
        if (!name) return 'Campo';
        // Troca underscores por espaços e capitaliza cada palavra
        return name.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    /**
     * Carrega os dados do perfil do usuário logado e preenche o formulário.
     */
    const loadProfile = async () => {
        try {
            // Usa a função centralizada do auth.js para uma chamada segura
            // (Assume-se que 'authenticatedFetch' está definido em outro lugar)
            const response = await authenticatedFetch('/api/users/me');

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Não foi possível carregar o perfil.');
            }

            // Armazena todos os dados do perfil, incluindo role e allowed_pages
            currentUserProfile = await response.json(); 

            // Preenche o formulário com os dados existentes
            fullNameInput.value = currentUserProfile.full_name || '';
            jobTitleInput.value = currentUserProfile.job_title || '';
            if (currentUserProfile.avatar_url && userAvatar) {
                // Adiciona um timestamp para evitar cache em navegadores mais agressivos
                userAvatar.src = `${currentUserProfile.avatar_url}?t=${Date.now()}`; 
            }

        } catch (error) {
            console.error('Erro ao carregar perfil:', error);
            uploadStatus.textContent = error.message || 'Erro ao carregar perfil.';
            uploadStatus.style.color = 'var(--error)';
        }
    };

    /**
     * Lida com o upload da foto e a atualização dos dados do perfil.
     */
    const handleProfileUpdate = async () => {
        // (Assume-se que 'getSession' está definido em outro lugar)
        const session = await getSession(); 
        if (!session) {
            alert("Sessão não encontrada. Faça o login.");
            return;
        }

        updateProfileBtn.disabled = true;
        updateProfileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Salvando...</span>';
        uploadStatus.textContent = '';
        uploadStatus.style.color = ''; // Reseta a cor da mensagem

        try {
            const file = avatarFileInput.files[0];
            // Usa a URL existente (se o perfil foi carregado) ou null
            let avatarUrl = currentUserProfile ? currentUserProfile.avatar_url : null; 

            // 1. Se um novo arquivo foi selecionado, faz o upload para o Supabase Storage
            if (file) {
                if (file.size > 1 * 1024 * 1024) { // Limite de 1MB
                    throw new Error("O arquivo da foto não pode exceder 1MB.");
                }
                uploadStatus.textContent = 'Enviando foto...';
                const fileExt = file.name.split('.').pop();
                const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

                // (Assume-se que 'supabase' está definido em outro lugar)
                const { data: uploadData, error: uploadError } = await supabase
                    .storage
                    .from('avatars')
                    .upload(filePath, file, { upsert: true }); // Usando upsert para garantir a substituição

                if (uploadError) {
                    throw uploadError;
                }

                const { data: urlData } = supabase
                    .storage
                    .from('avatars')
                    .getPublicUrl(uploadData.path);
                
                avatarUrl = urlData.publicUrl;
                uploadStatus.textContent = 'Foto enviada com sucesso!';
            }

            // 2. Monta o corpo da requisição APENAS com os campos que o endpoint /api/users/me aceita.
            const updateData = {
                full_name: fullNameInput.value.trim(),
                job_title: jobTitleInput.value.trim(),
                avatar_url: avatarUrl || null 
            };

            // 3. Envia os dados para a nossa API para salvar no banco
            const response = await authenticatedFetch('/api/users/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            // Se a resposta da API não for 'ok', lança o corpo do erro (o JSON inteiro)
            if (!response.ok) {
                const errorData = await response.json();
                throw errorData;
            }

            uploadStatus.textContent = 'Perfil atualizado com sucesso!';
            uploadStatus.style.color = 'var(--success)';
            
            if (userAvatar && avatarUrl) {
                // Força o recarregamento da nova imagem
                userAvatar.src = `${avatarUrl}?t=${Date.now()}`; 
            }
            
            // Recarrega o perfil para sincronizar o estado e garantir que currentUserProfile tenha os dados mais recentes
            await loadProfile(); 

        } catch (error) {
            console.error('Erro detalhado ao atualizar perfil:', error);
            let displayMessage;

            // Caso 1: Erro de validação da sua API (FastAPI/Pydantic), que vem com um array em 'detail'.
            if (error && Array.isArray(error.detail)) {
                // Mapeia cada objeto de erro para uma mensagem clara, formatando o nome do campo
                displayMessage = error.detail.map(err => {
                    // Tenta obter o nome do campo (loc[1])
                    const fieldName = formatFieldName(err.loc[1]); 
                    // Junta o nome do campo e a mensagem de erro (ex: 'Full Name: Field required')
                    return `${fieldName}: ${err.msg}`;
                }).join('; ');
            } 
            // Caso 2: Erro do Supabase ou outro erro padrão que possui a propriedade 'message'.
            else if (error && error.message) {
                displayMessage = error.message;
            } 
            // Caso 3: Um erro inesperado que não se encaixa nos padrões acima.
            else {
                displayMessage = 'Ocorreu uma falha desconhecida.';
            }

            uploadStatus.textContent = `Erro: ${displayMessage}`;
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
