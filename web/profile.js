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

    // Assumindo que 'authenticatedFetch', 'getSession', e 'supabase' estão definidos globalmente
    // ou importados em outro script (auth.js, supabase.js, etc.)

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
        uploadStatus.style.color = ''; // Reseta a cor da mensagem

        try {
            const file = avatarFileInput.files[0];
            let avatarUrl = currentUserProfile ? currentUserProfile.avatar_url : null; // Mantém a URL antiga por padrão

            // 1. Se um novo arquivo foi selecionado, faz o upload para o Supabase Storage
            if (file) {
                if (file.size > 1 * 1024 * 1024) { // Limite de 1MB
                    throw new Error("O arquivo da foto não pode exceder 1MB.");
                }
                uploadStatus.textContent = 'Enviando foto...';
                const fileExt = file.name.split('.').pop();
                const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

                const { data: uploadData, error: uploadError } = await supabase
                    .storage
                    .from('avatars')
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false // Mudar para true se quiser substituir o arquivo
                    });

                if (uploadError) {
                    throw uploadError;
                }

                // Supabase retorna o path, precisamos da URL pública
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
                // Garante que avatarUrl seja enviado (pode ser null se não houver avatar)
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

            // --- PONTO DA CORREÇÃO 1: MODO DE LANÇAR O ERRO ---
            if (!response.ok) {
                const errorData = await response.json();
                // Lança o objeto JSON de erro completo (FastAPI/Pydantic)
                throw errorData; 
            }

            uploadStatus.textContent = 'Perfil atualizado com sucesso!';
            uploadStatus.style.color = 'var(--success)';
            
            // Atualiza o avatar na barra superior
            if (userAvatar && avatarUrl) {
                // Adiciona um timestamp para forçar o navegador a recarregar a nova imagem
                userAvatar.src = `${avatarUrl}?t=${Date.now()}`; 
            }

            // Recarrega o perfil para sincronizar o estado
            await loadProfile(); 
            // Garante que o estado interno do perfil (que estava sendo usado antes da atualização) seja resetado
            currentUserProfile = null; 

        // --- PONTO DA CORREÇÃO 2: MODO DE CAPTURAR E EXIBIR O ERRO APRIMORADO ---
        } catch (error) {
            console.error('Erro detalhado ao atualizar perfil:', error);
            let displayMessage;

            // Caso 1: Erro de validação da sua API (FastAPI/Pydantic), que vem com um array em 'detail'.
            if (error && Array.isArray(error.detail)) {
                // Mapeia cada objeto de erro para uma mensagem clara, formatando o nome do campo
                displayMessage = error.detail.map(err => {
                    // Tenta obter o nome do campo (loc[1]) ou usa 'Campo'
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
