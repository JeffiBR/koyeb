// dashboard-data.js - Módulo de gerenciamento de dados do dashboard

class DashboardData {
    constructor() {
        this.baseURL = '/api/dashboard';
        this.cache = new Map();
        this.cacheTimeout = 300000; // 5 minutos
    }

    async getToken() {
        try {
            const { data } = await supabase.auth.getSession();
            return data.session?.access_token || null;
        } catch (error) {
            console.error('❌ Erro ao obter token:', error);
            return null;
        }
    }

    async fetchWithCache(endpoint, params = {}) {
        const cacheKey = `${endpoint}-${JSON.stringify(params)}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const data = await this.fetchData(endpoint, params);
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            return data;
        } catch (error) {
            // Se houver cache, usar mesmo que expirado
            if (cached) {
                console.warn('⚠️ Usando cache expirado devido a erro:', error);
                return cached.data;
            }
            throw error;
        }
    }

    async fetchData(endpoint, params = {}) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('Token não disponível');
        }

        const queryString = Object.keys(params).length > 0 
            ? `?${new URLSearchParams(params).toString()}`
            : '';

        const response = await fetch(`${this.baseURL}${endpoint}${queryString}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Sessão expirada');
            }
            throw new Error(`Erro ${response.status} em ${endpoint}`);
        }

        return await response.json();
    }

    async postData(endpoint, data) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('Token não disponível');
        }

        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Erro ${response.status} em ${endpoint}`);
        }

        return await response.json();
    }

    // Métodos específicos do dashboard
    async getDashboardSummary(startDate, endDate, cnpjs = null) {
        const params = {
            start_date: startDate,
            end_date: endDate
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }
        return this.fetchWithCache('/summary', params);
    }

    async getPriceTrends(startDate, endDate, cnpjs = null) {
        const params = {
            start_date: startDate,
            end_date: endDate
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }
        return this.fetchWithCache('/price-trends', params);
    }

    async getTopProducts(startDate, endDate, cnpjs = null, limit = 10) {
        const params = {
            start_date: startDate,
            end_date: endDate,
            limit: limit
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }
        return this.fetchWithCache('/top-products', params);
    }

    async getCategoryStats(startDate, endDate, cnpjs = null) {
        const params = {
            start_date: startDate,
            end_date: endDate
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }
        return this.fetchWithCache('/category-stats', params);
    }

    async getBargains(startDate, endDate, cnpjs = null, limit = 10) {
        const params = {
            start_date: startDate,
            end_date: endDate,
            limit: limit
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }
        return this.fetchWithCache('/bargains', params);
    }

    async getMarketComparison(startDate, endDate, cnpjs = null) {
        const params = {
            start_date: startDate,
            end_date: endDate
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }
        return this.fetchWithCache('/market-comparison', params);
    }

    async getRecentActivity(limit = 10) {
        return this.fetchWithCache('/recent-activity', { limit });
    }

    async getMarkets() {
        return this.fetchWithCache('/markets');
    }

    async getAvailableDates() {
        return this.fetchWithCache('/available-dates');
    }

    async getProductBarcodeAnalysis(requestData) {
        return this.postData('/product-barcode-analysis', requestData);
    }

    async getProductInfo(barcode) {
        return this.fetchWithCache(`/product-info/${barcode}`);
    }

    async getProductSuggestions(query, limit = 10) {
        return this.fetchWithCache('/product-suggestions', { query, limit });
    }

    async getMarketSuggestions(query, limit = 10) {
        return this.fetchWithCache('/market-suggestions', { query, limit });
    }

    async exportData(startDate, endDate, cnpjs = null, exportType = 'csv') {
        const params = {
            start_date: startDate,
            end_date: endDate,
            export_type: exportType
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }

        const token = await this.getToken();
        if (!token) {
            throw new Error('Token não disponível');
        }

        const response = await fetch(`${this.baseURL}/export-data?${new URLSearchParams(params)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Erro ao exportar dados');
        }

        return await response.blob();
    }

    async exportAnalysisData(requestData) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('Token não disponível');
        }

        const response = await fetch(`${this.baseURL}/export-analysis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error('Erro ao exportar análise');
        }

        return await response.blob();
    }

    clearCache() {
        this.cache.clear();
    }

    // Método para buscar estatísticas em tempo real
    async getRealTimeStats() {
        try {
            const [summary, trends, activity] = await Promise.all([
                this.getDashboardSummary(
                    new Date().toISOString().split('T')[0],
                    new Date().toISOString().split('T')[0]
                ),
                this.getPriceTrends(
                    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    new Date().toISOString().split('T')[0]
                ),
                this.getRecentActivity(5)
            ]);

            return {
                summary,
                trends: trends.slice(-10), // Últimos 10 dias
                recentActivity: activity.ultimas_coletas?.slice(0, 5) || []
            };
        } catch (error) {
            console.error('Erro ao buscar estatísticas em tempo real:', error);
            throw error;
        }
    }
}
