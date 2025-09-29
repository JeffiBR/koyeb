document.addEventListener('DOMContentLoaded', () => {
    const productInput = document.getElementById('productInput');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const supermarketFiltersContainer = document.getElementById('supermarketFilters');
    const compareButton = document.getElementById('compareButton');
    const chartCanvas = document.getElementById('priceChart');
    let priceChart = null;

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 29);
    endDateInput.value = today.toISOString().split('T')[0];
    startDateInput.value = thirtyDaysAgo.toISOString().split('T')[0];
    
    const loadSupermarkets = async () => {
        try {
            // <-- CORREÇÃO AQUI: Usando o endpoint público que não exige login -->
            const response = await fetch(`/api/supermarkets/public`);

            if (!response.ok) throw new Error('Falha ao carregar a lista de mercados.');

            const data = await response.json();
            supermarketFiltersContainer.innerHTML = '';
            data.forEach(market => {
                const filterHtml = `<label><input type="checkbox" name="supermarket" value="${market.cnpj}">${market.nome}</label>`;
                supermarketFiltersContainer.innerHTML += filterHtml;
            });
        } catch (error) { 
            console.error('Erro ao carregar supermercados:', error);
            supermarketFiltersContainer.innerHTML = '<p style="color: red;">Não foi possível carregar os filtros.</p>';
        }
    };

    const comparePrices = async () => {
        const productIdentifier = productInput.value.trim();
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const selectedCnpjs = Array.from(document.querySelectorAll('input[name="supermarket"]:checked')).map(cb => cb.value);
        if (!productIdentifier) { alert('Por favor, informe um produto.'); return; }
        if (selectedCnpjs.length < 2) { alert('Selecione pelo menos dois mercados para comparar.'); return; }
        
        const session = await getSession();
        if (!session) {
            alert('Você precisa estar logado para usar esta função.');
            return;
        }

        compareButton.disabled = true;
        compareButton.textContent = 'Buscando histórico...';
        try {
            const response = await fetch(`/api/price-history`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ product_identifier: productIdentifier, cnpjs: selectedCnpjs, start_date: startDate, end_date: endDate })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail);
            }
            const data = await response.json();
            renderChart(data);
        } catch (error) {
            alert(`Erro ao buscar dados: ${error.message}`);
        } finally {
            compareButton.disabled = false;
            compareButton.textContent = 'Comparar Preços';
        }
    };

    const renderChart = (data) => {
        if (priceChart) priceChart.destroy();
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#7f8c8d'];
        const datasets = Object.keys(data).map((marketName, index) => ({
            label: marketName,
            data: data[marketName],
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length],
            tension: 0.1,
            fill: false
        }));
        const ctx = chartCanvas.getContext('2d');
        priceChart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                scales: {
                    x: { type: 'time', time: { unit: 'day', tooltipFormat: 'dd/MM/yyyy' }, title: { display: true, text: 'Data' } },
                    y: { title: { display: true, text: 'Preço (R$)' }, ticks: { callback: (value) => 'R$ ' + value.toFixed(2) } }
                }
            }
        });
    };

    compareButton.addEventListener('click', comparePrices);
    loadSupermarkets();
});
