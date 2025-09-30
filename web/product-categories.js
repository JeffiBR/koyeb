// Sistema de Categorias Inteligente para Produtos
class ProductCategoryManager {
    constructor() {
        this.categories = {
            'Todos': {
                keywords: [],
                filters: (product) => true,
                description: 'Todos os produtos'
            },
            'Carnes': {
                keywords: [
                    'picanha', 'alcatra', 'contra filé', 'contrafile', 'coxão', 'maminha', 
                    'fraldinha', 'músculo', 'acém', 'paleta', 'costela', 'hambúrguer', 
                    'hamburguer', 'frango', 'coxa', 'sobrecoxa', 'asa', 'peito', 'linguiça', 
                    'linguica', 'bisteca', 'pernil', 'lombo', 'bovino', 'suíno', 'suino', 
                    'carne', 'filé', 'file', 'contra', 'picanha', 'alcatra', 'maminha'
                ],
                filters: (product) => {
                    const name = product.nome_produto.toLowerCase();
                    const unit = product.tipo_unidade ? product.tipo_unidade.toLowerCase() : '';
                    
                    // Verifica se é carne por palavra-chave
                    const isMeat = this.categories['Carnes'].keywords.some(keyword => 
                        name.includes(keyword)
                    );
                    
                    // Verifica se tem unidade em KG (case insensitive)
                    const hasKgUnit = unit.includes('kg') || unit.includes('kilograma') || unit.includes('quilo');
                    
                    return isMeat && hasKgUnit;
                },
                description: 'Carnes vendidas por quilograma',
                unit: 'KG'
            },
            'Hortifrúti': {
                keywords: [
                    'batata', 'cebola', 'tomate', 'banana', 'maçã', 'maca', 'laranja', 
                    'alho', 'cenoura', 'alface', 'verdura', 'legume', 'fruta', 'ovo', 
                    'limão', 'limao', 'mamão', 'mamao', 'pimentão', 'pimentao', 'abacaxi',
                    'abobora', 'abóbora', 'berinjela', 'brócolis', 'brocolis', 'couve',
                    'espinafre', 'rúcula', 'rucula', 'repolho', 'chuchu', 'quiabo',
                    'pepino', 'pêssego', 'pescego', 'uva', 'manga', 'melancia', 'melão', 'melao'
                ],
                filters: (product) => {
                    const name = product.nome_produto.toLowerCase();
                    const unit = product.tipo_unidade ? product.tipo_unidade.toLowerCase() : '';
                    
                    // Verifica se é hortifrúti por palavra-chave
                    const isHortifruti = this.categories['Hortifrúti'].keywords.some(keyword => 
                        name.includes(keyword)
                    );
                    
                    // Para hortifrúti, pode ser KG ou UN
                    const hasValidUnit = unit.includes('kg') || unit.includes('un') || 
                                       unit.includes('unidade') || unit.includes('duzia') ||
                                       unit.includes('dúzia') || unit.includes('pacote') ||
                                       unit.includes('maço') || unit.includes('maco');
                    
                    return isHortifruti && hasValidUnit;
                },
                description: 'Frutas, verduras e legumes',
                unit: 'VARIADO'
            },
            'Laticínios': {
                keywords: [
                    'leite', 'queijo', 'mussarela', 'muçarela', 'mucarela', 'prato', 
                    'minas', 'requeijão', 'requeijao', 'iogurte', 'manteiga', 
                    'margarina', 'creme de leite', 'leite condensado', 'coalhada',
                    'nata', 'parmesão', 'parmesao', 'gorgonzola', 'ricota', 'cottage'
                ],
                filters: (product) => {
                    const name = product.nome_produto.toLowerCase();
                    return this.categories['Laticínios'].keywords.some(keyword => 
                        name.includes(keyword)
                    );
                },
                description: 'Leite, queijos e derivados'
            },
            'Mercearia': {
                keywords: [
                    'arroz', 'feijão', 'feijao', 'macarrão', 'macarrao', 'farinha', 
                    'fubá', 'fuba', 'aveia', 'granola', 'cereal', 'milho', 'ervilha', 
                    'lentilha', 'açúcar', 'acucar', 'adoçante', 'adocante', 'sal', 
                    'óleo', 'oleo', 'azeite', 'vinagre', 'café', 'cafe', 'farinha',
                    'trigo', 'fermento', 'amido', 'maizena', 'gelatina', 'pudim'
                ],
                filters: (product) => {
                    const name = product.nome_produto.toLowerCase();
                    return this.categories['Mercearia'].keywords.some(keyword => 
                        name.includes(keyword)
                    );
                },
                description: 'Produtos básicos da despensa'
            },
            'Padaria': {
                keywords: [
                    'pão', 'pao', 'bisnaguinha', 'torrada', 'bolo', 'biscoito', 
                    'bolacha', 'rosca', 'croissant', 'baguete', 'ciabatta', 'foccacia',
                    'pão de queijo', 'pao de queijo', 'sonho', 'donut', 'rosca',
                    'pão doce', 'pao doce', 'pão integral', 'pao integral'
                ],
                filters: (product) => {
                    const name = product.nome_produto.toLowerCase();
                    return this.categories['Padaria'].keywords.some(keyword => 
                        name.includes(keyword)
                    );
                },
                description: 'Pães, bolos e biscoitos'
            },
            'Bebidas': {
                keywords: [
                    'refrigerante', 'coca cola', 'coca-cola', 'guaraná', 'guarana', 
                    'suco', 'água', 'agua', 'cerveja', 'vinho', 'whisky', 'vodka',
                    'energético', 'energetico', 'chá', 'cha', 'mate', 'café', 'cafe',
                    'água mineral', 'agua mineral', 'água com gás', 'agua com gas'
                ],
                filters: (product) => {
                    const name = product.nome_produto.toLowerCase();
                    return this.categories['Bebidas'].keywords.some(keyword => 
                        name.includes(keyword)
                    );
                },
                description: 'Bebidas em geral'
            },
            'Limpeza': {
                keywords: [
                    'sabão', 'sabao', 'detergente', 'amaciante', 'água sanitária',
                    'agua sanitaria', 'desinfetante', 'álcool', 'alcool', 'limpa vidros',
                    'lustra móveis', 'lustra moveis', 'sabão em pó', 'sabao em po',
                    'cloro', 'limpa banheiro', 'limpeza', 'multiuso', 'inseticida'
                ],
                filters: (product) => {
                    const name = product.nome_produto.toLowerCase();
                    return this.categories['Limpeza'].keywords.some(keyword => 
                        name.includes(keyword)
                    );
                },
                description: 'Produtos de limpeza'
            },
            'Higiene': {
                keywords: [
                    'shampoo', 'condicionador', 'sabonete', 'pasta de dente', 
                    'creme dental', 'escova de dente', 'fio dental', 'desodorante',
                    'papel higiênico', 'papel higienico', 'absorvente', 'protetor',
                    'hidratante', 'perfume', 'colônia', 'colonia', 'lâmina', 'lamina'
                ],
                filters: (product) => {
                    const name = product.nome_produto.toLowerCase();
                    return this.categories['Higiene'].keywords.some(keyword => 
                        name.includes(keyword)
                    );
                },
                description: 'Produtos de higiene pessoal'
            }
        };
    }

    // Classifica um produto em uma categoria
    classifyProduct(product) {
        for (const [categoryName, category] of Object.entries(this.categories)) {
            if (categoryName !== 'Todos' && category.filters(product)) {
                return categoryName;
            }
        }
        return 'Outros';
    }

    // Filtra produtos por categoria
    filterByCategory(products, categoryName) {
        if (categoryName === 'Todos') {
            return products;
        }

        const category = this.categories[categoryName];
        if (!category) {
            console.warn(`Categoria não encontrada: ${categoryName}`);
            return products;
        }

        return products.filter(product => category.filters(product));
    }

    // Obtém estatísticas por categoria
    getCategoryStats(products) {
        const stats = {
            'Todos': products.length
        };

        // Contar produtos por categoria
        Object.keys(this.categories).forEach(categoryName => {
            if (categoryName !== 'Todos') {
                const filtered = this.filterByCategory(products, categoryName);
                stats[categoryName] = filtered.length;
            }
        });

        return stats;
    }

    // Normaliza o nome do produto para melhor comparação
    normalizeProductName(name) {
        return name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[^a-z0-9\s]/g, ' ') // Remove caracteres especiais
            .replace(/\s+/g, ' ') // Remove espaços extras
            .trim();
    }

    // Agrupa produtos similares (para comparação de preços)
    groupSimilarProducts(products) {
        const groups = {};
        
        products.forEach(product => {
            const normalized = this.normalizeProductName(product.nome_produto);
            const category = this.classifyProduct(product);
            
            // Cria uma chave única baseada no nome normalizado e categoria
            const key = `${category}_${normalized}`;
            
            if (!groups[key]) {
                groups[key] = {
                    category: category,
                    normalizedName: normalized,
                    originalName: product.nome_produto,
                    products: []
                };
            }
            
            groups[key].products.push(product);
        });

        // Ordena por preço (menor primeiro)
        Object.values(groups).forEach(group => {
            group.products.sort((a, b) => a.preco_produto - b.preco_produto);
            group.lowestPrice = group.products[0]?.preco_produto;
            group.highestPrice = group.products[group.products.length - 1]?.preco_produto;
            group.priceDifference = group.highestPrice - group.lowestPrice;
            group.cheapestMarket = group.products[0]?.nome_supermercado;
        });

        return groups;
    }

    // Encontra as melhores ofertas por categoria
    findBestDeals(products, limit = 30) {
        const groups = this.groupSimilarProducts(products);
        const deals = [];

        Object.values(groups).forEach(group => {
            if (group.products.length > 1 && group.priceDifference > 0) {
                const bestDeal = group.products[0]; // Produto mais barato
                deals.push({
                    ...bestDeal,
                    priceDifference: group.priceDifference,
                    savingsPercentage: ((group.priceDifference / group.highestPrice) * 100).toFixed(1),
                    similarProductsCount: group.products.length,
                    category: group.category
                });
            }
        });

        // Ordena por maior economia percentual
        return deals
            .sort((a, b) => b.savingsPercentage - a.savingsPercentage)
            .slice(0, limit);
    }

    // Gera relatório de categorias
    generateCategoryReport(products) {
        const stats = this.getCategoryStats(products);
        const groups = this.groupSimilarProducts(products);
        
        const report = {
            totalProducts: products.length,
            categories: {},
            bestDeals: this.findBestDeals(products, 10)
        };

        // Estatísticas detalhadas por categoria
        Object.keys(this.categories).forEach(categoryName => {
            const categoryProducts = this.filterByCategory(products, categoryName);
            const categoryGroups = this.groupSimilarProducts(categoryProducts);
            
            report.categories[categoryName] = {
                productCount: categoryProducts.length,
                groupCount: Object.keys(categoryGroups).length,
                averagePrice: this.calculateAveragePrice(categoryProducts),
                priceRange: this.calculatePriceRange(categoryProducts),
                bestDeal: this.findBestDeals(categoryProducts, 1)[0]
            };
        });

        return report;
    }

    // Calcula preço médio
    calculateAveragePrice(products) {
        if (products.length === 0) return 0;
        const sum = products.reduce((total, product) => total + product.preco_produto, 0);
        return sum / products.length;
    }

    // Calcula faixa de preço
    calculatePriceRange(products) {
        if (products.length === 0) return { min: 0, max: 0 };
        
        const prices = products.map(p => p.preco_produto);
        return {
            min: Math.min(...prices),
            max: Math.max(...prices)
        };
    }
}

// Instância global do gerenciador de categorias
const productCategoryManager = new ProductCategoryManager();

// Funções de utilidade para uso no dashboard
window.ProductCategories = {
    // Filtra produtos por categoria
    filterProducts: (products, category) => {
        return productCategoryManager.filterByCategory(products, category);
    },

    // Classifica um produto
    classifyProduct: (product) => {
        return productCategoryManager.classifyProduct(product);
    },

    // Encontra melhores ofertas
    findBestDeals: (products, limit = 30) => {
        return productCategoryManager.findBestDeals(products, limit);
    },

    // Gera relatório completo
    generateReport: (products) => {
        return productCategoryManager.generateCategoryReport(products);
    },

    // Obtém estatísticas
    getStats: (products) => {
        return productCategoryManager.getCategoryStats(products);
    },

    // Normaliza nome do produto
    normalizeName: (name) => {
        return productCategoryManager.normalizeProductName(name);
    }
};

// Exemplo de uso:
/*
// 1. Filtrar carnes por KG
const carnes = ProductCategories.filterProducts(produtos, 'Carnes');

// 2. Encontrar melhores ofertas
const melhoresOfertas = ProductCategories.findBestDeals(produtos);

// 3. Gerar relatório completo
const relatorio = ProductCategories.generateReport(produtos);

// 4. Obter estatísticas por categoria
const estatisticas = ProductCategories.getStats(produtos);
*/
