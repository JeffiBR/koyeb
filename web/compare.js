function createPriceRow(priceData, lowestPrice) {
    if (priceData.price <= 0) {
        return `
            <div class="price-row unavailable">
                <div class="market-info">
                    <span class="market-name">${priceData.marketName}</span>
                    <span class="market-address">${priceData.marketAddress}</span>
                    <div class="last-sale-info">
                        <span class="last-sale-label">Última venda:</span>
                        <span class="last-sale-date unavailable-date">${priceData.lastSaleDate}</span>
                    </div>
                </div>
                <div class="price-info">
                    <span class="price-value">Indisponível</span>
                </div>
            </div>
        `;
    }

    const isLowest = Math.abs(priceData.price - lowestPrice) < 0.01;
    const differenceClass = isLowest ? 'lowest' : priceData.percentageDifference > 0 ? 'higher' : 'equal';
    
    return `
        <div class="price-row ${differenceClass}">
            <div class="market-info">
                <span class="market-name">${priceData.marketName}</span>
                <span class="market-address">${priceData.marketAddress}</span>
                <div class="last-sale-info">
                    <span class="last-sale-label">Última venda:</span>
                    <span class="last-sale-date sale-date-red">${priceData.lastSaleDate}</span>
                </div>
            </div>
            <div class="price-info">
                <span class="price-value">R$ ${priceData.price.toFixed(2)}</span>
                ${!isLowest ? 
                    `<span class="price-difference">+${priceData.percentageDifference.toFixed(1)}%</span>` 
                    : '<span class="best-price-tag">Melhor Preço</span>'
                }
            </div>
        </div>
    `;
}
