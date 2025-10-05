# basket_service.py
import logging
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

# Modelos Pydantic para a cesta básica
class BasketProduct(BaseModel):
    product_barcode: str
    product_name: Optional[str] = None

class UserBasket(BaseModel):
    id: Optional[int] = None
    user_id: str
    basket_name: str = "Minha Cesta"
    products: List[BasketProduct] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class BasketCalculationRequest(BaseModel):
    basket_id: int
    cnpjs: List[str]

# Cria o roteador para a cesta básica
basket_router = APIRouter(prefix="/api/basket", tags=["basket"])

# Variáveis globais que serão configuradas posteriormente
supabase = None
supabase_admin = None
get_current_user = None
get_current_user_optional = None

def setup_basket_routes(app, supabase_client, supabase_admin_client, get_current_user_dep, get_current_user_optional_dep):
    """
    Configura as rotas da cesta básica com as dependências do main.py
    """
    global supabase, supabase_admin, get_current_user, get_current_user_optional
    supabase = supabase_client
    supabase_admin = supabase_admin_client
    get_current_user = get_current_user_dep
    get_current_user_optional = get_current_user_optional_dep
    
    # Inclui o roteador no app principal
    app.include_router(basket_router)

# Endpoints da cesta básica
@basket_router.get("/")
async def get_user_basket(current_user: dict = Depends(lambda: get_current_user())):
    try:
        response = await asyncio.to_thread(
            supabase.table('user_baskets').select('*').eq('user_id', current_user.id).execute
        )
        if response.data:
            return response.data[0]  # Retorna a primeira cesta do usuário
        else:
            # Cria uma cesta vazia se não existir
            new_basket = {
                'user_id': current_user.id,
                'basket_name': 'Minha Cesta',
                'products': []
            }
            create_response = await asyncio.to_thread(
                supabase.table('user_baskets').insert(new_basket).execute
            )
            return create_response.data[0]
    except Exception as e:
        logging.error(f"Erro ao buscar cesta do usuário: {e}")
        raise HTTPException(status_code=500, detail="Erro ao carregar cesta")

@basket_router.put("/")
async def update_user_basket(basket: UserBasket, current_user: dict = Depends(lambda: get_current_user())):
    try:
        # Verifica se a cesta pertence ao usuário
        existing_response = await asyncio.to_thread(
            supabase.table('user_baskets').select('*').eq('id', basket.id).eq('user_id', current_user.id).execute
        )
        
        if not existing_response.data:
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
        
        # Atualiza a cesta
        update_data = basket.dict(exclude={'id', 'user_id', 'created_at'})
        update_data['updated_at'] = datetime.now().isoformat()
        
        response = await asyncio.to_thread(
            supabase.table('user_baskets').update(update_data).eq('id', basket.id).execute
        )
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao atualizar cesta")

@basket_router.post("/calculate")
async def calculate_basket_prices(request: BasketCalculationRequest, current_user: dict = Depends(lambda: get_current_user())):
    try:
        # Busca a cesta do usuário
        basket_response = await asyncio.to_thread(
            supabase.table('user_baskets').select('*').eq('id', request.basket_id).eq('user_id', current_user.id).execute
        )
        
        if not basket_response.data:
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
        
        basket = basket_response.data[0]
        products = basket.get('products', [])
        
        if len(products) > 25:
            raise HTTPException(status_code=400, detail="A cesta não pode ter mais de 25 produtos")
        
        if not products:
            return {
                "complete_basket_results": {},
                "mixed_basket_results": {},
                "best_complete_basket": None
            }
        
        # Busca os preços mais recentes para cada produto nos mercados selecionados
        barcodes = [product['product_barcode'] for product in products]
        
        # Primeiro, busca informações básicas dos produtos
        products_info = {}
        for barcode in barcodes:
            product_response = await asyncio.to_thread(
                supabase.table('produtos').select('nome_produto').eq('codigo_barras', barcode).limit(1).execute
            )
            if product_response.data:
                products_info[barcode] = product_response.data[0]['nome_produto']
        
        # Agora busca os preços
        price_query = supabase.table('produtos').select('*').in_('codigo_barras', barcodes).in_('cnpj_supermercado', request.cnpjs)
        prices_response = await asyncio.to_thread(price_query.execute)
        
        if not prices_response.data:
            return {
                "complete_basket_results": {},
                "mixed_basket_results": {},
                "best_complete_basket": None
            }
        
        # Organiza os preços por mercado e por produto
        market_prices = {}
        product_prices = {}
        
        for price in prices_response.data:
            market_cnpj = price['cnpj_supermercado']
            market_name = price['nome_supermercado']
            barcode = price['codigo_barras']
            product_price = float(price['preco_produto'])
            
            # Organiza por mercado
            if market_cnpj not in market_prices:
                market_prices[market_cnpj] = {
                    'market_name': market_name,
                    'products': {},
                    'total': 0
                }
            
            # Pega o menor preço para cada produto no mesmo mercado
            if barcode not in market_prices[market_cnpj]['products'] or product_price < market_prices[market_cnpj]['products'][barcode]:
                market_prices[market_cnpj]['products'][barcode] = product_price
            
            # Organiza por produto para a cesta mista
            if barcode not in product_prices:
                product_prices[barcode] = {}
            
            if market_cnpj not in product_prices[barcode] or product_price < product_prices[barcode][market_cnpj]:
                product_prices[barcode][market_cnpj] = {
                    'price': product_price,
                    'market_name': market_name
                }
        
        # Calcula totais para cada mercado (cesta completa)
        complete_basket_results = {}
        for market_cnpj, market_data in market_prices.items():
            total = 0
            market_products = []
            
            for product in products:
                barcode = product['product_barcode']
                if barcode in market_data['products']:
                    price = market_data['products'][barcode]
                    total += price
                    market_products.append({
                        'barcode': barcode,
                        'name': products_info.get(barcode, 'Produto não encontrado'),
                        'price': price,
                        'found': True
                    })
                else:
                    market_products.append({
                        'barcode': barcode,
                        'name': products_info.get(barcode, 'Produto não encontrado'),
                        'price': 0,
                        'found': False
                    })
            
            complete_basket_results[market_cnpj] = {
                'market_name': market_data['market_name'],
                'total': round(total, 2),
                'products': market_products,
                'products_found': len([p for p in market_products if p['found']]),
                'total_products': len(products)
            }
        
        # Calcula a cesta mista (melhor preço de cada produto em qualquer mercado)
        mixed_basket_results = {
            'total': 0,
            'products': [],
            'market_breakdown': {}
        }
        
        for product in products:
            barcode = product['product_barcode']
            if barcode in product_prices:
                # Encontra o menor preço para este produto
                best_price = float('inf')
                best_market = None
                best_market_name = None
                
                for market_cnpj, price_data in product_prices[barcode].items():
                    if price_data['price'] < best_price:
                        best_price = price_data['price']
                        best_market = market_cnpj
                        best_market_name = price_data['market_name']
                
                if best_price != float('inf'):
                    mixed_basket_results['total'] += best_price
                    product_info = {
                        'barcode': barcode,
                        'name': products_info.get(barcode, 'Produto não encontrado'),
                        'price': best_price,
                        'market_cnpj': best_market,
                        'market_name': best_market_name,
                        'found': True
                    }
                    mixed_basket_results['products'].append(product_info)
                    
                    # Adiciona ao breakdown por mercado
                    if best_market not in mixed_basket_results['market_breakdown']:
                        mixed_basket_results['market_breakdown'][best_market] = {
                            'market_name': best_market_name,
                            'products': [],
                            'subtotal': 0
                        }
                    
                    mixed_basket_results['market_breakdown'][best_market]['products'].append(product_info)
                    mixed_basket_results['market_breakdown'][best_market]['subtotal'] += best_price
                else:
                    mixed_basket_results['products'].append({
                        'barcode': barcode,
                        'name': products_info.get(barcode, 'Produto não encontrado'),
                        'price': 0,
                        'market_cnpj': None,
                        'market_name': 'Não encontrado',
                        'found': False
                    })
            else:
                mixed_basket_results['products'].append({
                    'barcode': barcode,
                    'name': products_info.get(barcode, 'Produto não encontrado'),
                    'price': 0,
                    'market_cnpj': None,
                    'market_name': 'Não encontrado',
                    'found': False
                })
        
        mixed_basket_results['total'] = round(mixed_basket_results['total'], 2)
        
        # Encontra a melhor cesta completa
        best_complete = None
        if complete_basket_results:
            valid_markets = {k: v for k, v in complete_basket_results.items() if v['products_found'] > 0}
            if valid_markets:
                best_complete = min(valid_markets.values(), key=lambda x: x['total'])
        
        # Calcula economia percentual
        if best_complete and mixed_basket_results['total'] > 0:
            economy_percent = ((best_complete['total'] - mixed_basket_results['total']) / best_complete['total']) * 100
            mixed_basket_results['economy_percent'] = round(economy_percent, 1)
        else:
            mixed_basket_results['economy_percent'] = 0
        
        return {
            "complete_basket_results": complete_basket_results,
            "mixed_basket_results": mixed_basket_results,
            "best_complete_basket": best_complete
        }
        
    except Exception as e:
        logging.error(f"Erro ao calcular preços da cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao calcular preços da cesta")
