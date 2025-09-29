import asyncio
import aiohttp
import hashlib
from datetime import datetime
import logging
import time
from typing import Dict, Any, List

# --- Configurações Otimizadas ---
ECONOMIZA_ALAGOAS_API_URL = 'http://api.sefaz.al.gov.br/sfz-economiza-alagoas-api/api/public/produto/pesquisa'
DIAS_PESQUISA = 3
REGISTROS_POR_PAGINA = 50
RETRY_MAX = 3
RETRY_BASE_MS = 2000
CONCORRENCIA_PRODUTOS = 4
TIMEOUT_POR_MERCADO_SEGUNDOS = 20 * 60

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

# --- Funções Utilitárias ---
def normalizar_texto(txt: str) -> str:
    if not txt: return ""
    return txt.lower().strip()

def gerar_id_registro(item: Dict[str, Any]) -> str:
    h = hashlib.sha1()
    h.update(f"{item.get('cnpj_supermercado')}|{item.get('id_produto')}|{item.get('preco_produto')}|{item.get('data_ultima_venda')}".encode('utf-8'))
    return h.digest().hex()[:16]

def detectar_tipo_unidade(nome_produto: str, unidade_medida_api: str) -> str:
    nome_lower = nome_produto.lower(); unidade_lower = unidade_medida_api.lower() if unidade_medida_api else ""
    palavras_kg = ['kg', 'quilo', ' a granel'];
    if unidade_lower == 'kg': return 'KG'
    for palavra in palavras_kg:
        if palavra in nome_lower or palavra in unidade_lower: return 'KG'
    return 'UN'

# --- Lógica Principal de Coleta ---
async def consultar_produto(produto: str, mercado: Dict[str, str], data_coleta: str, token: str, coleta_id: int) -> List[Dict[str, Any]]:
    cnpj = mercado['cnpj']
    pagina = 1
    todos_os_itens = []
    async with aiohttp.ClientSession() as session:
        while True:
            request_body = {
                "produto": {"descricao": produto.upper()}, "estabelecimento": {"individual": {"cnpj": cnpj}},
                "dias": DIAS_PESQUISA, "pagina": pagina, "registrosPorPagina": REGISTROS_POR_PAGINA
            }
            headers = {'AppToken': token, 'Content-Type': 'application/json'}
            response_data = None
            for attempt in range(RETRY_MAX):
                try:
                    await asyncio.sleep(0.3)
                    async with session.post(ECONOMIZA_ALAGOAS_API_URL, json=request_body, headers=headers, timeout=45) as response:
                        if response.status == 200:
                            response_data = await response.json(); break
                        else:
                            logging.warning(f"API ERRO: Status {response.status} para '{produto}' em {mercado['nome']}. Tentativa {attempt + 1}/{RETRY_MAX}")
                            await asyncio.sleep((RETRY_BASE_MS / 1000) * (2 ** attempt))
                except Exception as e:
                    logging.error(f"CONEXÃO ERRO para '{produto}' em {mercado['nome']}: {e}. Tentativa {attempt + 1}/{RETRY_MAX}")
                    await asyncio.sleep((RETRY_BASE_MS / 1000) * (2 ** attempt))
            if not response_data:
                logging.error(f"FALHA TOTAL ao coletar '{produto}' em {mercado['nome']}."); return []
            conteudo = response_data.get('conteudo', [])
            for item in conteudo:
                prod_info = item.get('produto', {}); venda_info = prod_info.get('venda', {})
                nome_produto_original = prod_info.get('descricao', ''); unidade_medida_original = prod_info.get('unidadeMedida', '')
                registro = {
                    'nome_supermercado': mercado['nome'], 'cnpj_supermercado': cnpj,
                    'nome_produto': nome_produto_original, 'nome_produto_normalizado': normalizar_texto(nome_produto_original),
                    'id_produto': prod_info.get('gtin') or normalizar_texto(f"{nome_produto_original}_{unidade_medida_original}"),
                    'preco_produto': venda_info.get('valorVenda'), 'unidade_medida': unidade_medida_original,
                    'data_ultima_venda': venda_info.get('dataVenda'), 'data_coleta': data_coleta, 
                    'codigo_barras': prod_info.get('gtin'), 'tipo_unidade': detectar_tipo_unidade(nome_produto_original, unidade_medida_original),
                    'coleta_id': coleta_id
                }
                if registro['preco_produto'] is not None:
                    registro['id_registro'] = gerar_id_registro(registro); todos_os_itens.append(registro)
            total_paginas = response_data.get('totalPaginas', 1)
            logging.info(f"Coletado: {mercado['nome']} - '{produto}' - Página {pagina}/{total_paginas} - Itens: {len(conteudo)}")
            if pagina >= total_paginas: break
            pagina += 1
    return todos_os_itens

async def coletar_dados_mercado(mercado: Dict[str, Any], token: str, supabase_client: Any, status_tracker: Dict[str, Any], coleta_id: int):
    produtos_a_buscar = status_tracker['produtos_lista']
    total_produtos = len(produtos_a_buscar)
    registros_salvos_neste_mercado = 0
    status_tracker['currentMarket'] = mercado['nome']
    status_tracker['productsProcessedInMarket'] = 0
    
    async def task_wrapper(prod, index):
        status_tracker['currentProduct'] = prod
        status_tracker['productsProcessedInMarket'] = index + 1
        resultados = await consultar_produto(prod, mercado, datetime.now().isoformat(), token, coleta_id)
        if resultados:
            status_tracker['totalItemsFound'] += len(resultados)
        return resultados

    tasks = [task_wrapper(produto, i) for i, produto in enumerate(produtos_a_buscar)]
    resultados_por_produto = await asyncio.gather(*tasks)
    
    resultados_finais = [item for sublist in resultados_por_produto for item in sublist]
    registros_unicos = {registro['id_registro']: registro for registro in resultados_finais}
    resultados_unicos_lista = list(registros_unicos.values())
    
    logging.info(f"COLETA PARA '{mercado['nome']}': {len(resultados_finais)} brutos -> {len(resultados_unicos_lista)} únicos.")
    
    if resultados_unicos_lista:
        dados_para_db = [{k: v for k, v in item.items() if k != 'id_produto'} for item in resultados_unicos_lista]
        try:
            supabase_client.table('produtos').upsert(dados_para_db, on_conflict='id_registro').execute()
            registros_salvos = len(dados_para_db)
            logging.info(f"-----> SUPABASE SUCESSO: {registros_salvos} salvos para {mercado['nome']}.")
        except Exception as e:
            logging.error(f"-----> SUPABASE ERRO: Falha ao salvar para {mercado['nome']}: {e}")
            
    return registros_salvos

async def coletar_dados_mercado_com_timeout(mercado: Dict[str, Any], token: str, supabase_client: Any, status_tracker: Dict[str, Any], coleta_id: int):
    start_time_market = time.time()
    registros_salvos = 0
    try:
        registros_salvos = await asyncio.wait_for(
            coletar_dados_mercado(mercado, token, supabase_client, status_tracker, coleta_id),
            timeout=TIMEOUT_POR_MERCADO_SEGUNDOS
        )
    except asyncio.TimeoutError:
        logging.error(f"TIMEOUT! Coleta para {mercado['nome']} excedeu {TIMEOUT_POR_MERCADO_SEGUNDOS / 60} min.")
    
    end_time_market = time.time()
    duration_market = end_time_market - start_time_market
    
    status_tracker['report']['marketBreakdown'].append({
        "marketName": mercado['nome'], "itemsFound": registros_salvos, "duration": round(duration_market, 2)
    })
    
    status_tracker['marketsProcessed'] += 1
    
    elapsed_time = time.time() - status_tracker['startTime']
    markets_processed = status_tracker['marketsProcessed']
    total_markets = status_tracker['totalMarkets']
    
    if markets_processed > 0:
        time_per_market = elapsed_time / markets_processed
        remaining_markets = total_markets - markets_processed
        eta = remaining_markets * time_per_market
        status_tracker['etaSeconds'] = round(eta)
    
    status_tracker['progressPercent'] = (markets_processed / total_markets) * 100
    status_tracker['progresso'] = f"Processado {mercado['nome']} ({markets_processed}/{total_markets})"
    return registros_salvos

async def run_full_collection(supabase_client: Any, token: str, status_tracker: Dict[str, Any]):
    logging.info("Iniciando processo de coleta completa (versão com progresso)...")
    coleta_id = -1
    try:
        coleta_registro = supabase_client.table('coletas').insert({}).execute()
        coleta_id = coleta_registro.data[0]['id']
        logging.info(f"Novo registro de coleta criado com ID: {coleta_id}")
        response = supabase_client.table('supermercados').select('nome, cnpj').execute()
        if not response.data: raise Exception("Nenhum supermercado cadastrado.")
        MERCADOS = response.data
        
        NOMES_PRODUTOS = [
            # MERCEARIA (ALIMENTOS BÁSICOS E SECOS)
            'arroz', 'arroz integral', 'arroz parboilizado', 'feijão', 'feijão preto', 'feijão carioca',
            'açúcar', 'açúcar demerara', 'açúcar mascavo', 'adoçante', 'sal', 'sal grosso',
            'óleo', 'óleo de soja', 'óleo de girassol', 'óleo de milho', 'azeite', 'vinagre',
            'café', 'café em pó', 'café solúvel', 'filtro de café', 'farinha de trigo', 'farinha de mandioca',
            'farinha de rosca', 'fubá', 'amido de milho', 'macarrão', 'massa para lasanha',
            'molho de tomate', 'extrato de tomate', 'milho', 'ervilha', 'seleta de legumes',
            'atum', 'sardinha', 'maionese', 'ketchup', 'mostarda', 'caldo', 'tempero',
            # HORTIFRÚTI (FRUTAS, VERDURAS E LEGUMES)
            'alho', 'cebola', 'batata', 'tomate', 'cenoura', 'pimentão', 'abobrinha',
            'batata doce', 'mandioca', 'aipim', 'beterraba', 'chuchu', 'pepino',
            'alface', 'couve', 'repolho', 'brócolis', 'espinafre', 'rúcula', 'salsa', 'cebolinha',
            'banana', 'maçã', 'laranja', 'limão', 'mamão', 'melão', 'melancia',
            'abacaxi', 'manga', 'uva', 'morango', 'pera', 'abacate', 'ovos',
            # AÇOUGUE (CARNES)
            'carne bovina', 'bife', 'carne moída', 'picanha', 'alcatra', 'contra filé', 'coxão mole',
            'músculo', 'acém', 'paleta', 'costela', 'hambúrguer', 'frango', 'peito de frango',
            'coxa de frango', 'sobrecoxa', 'asa de frango', 'linguiça', 'linguiça toscana',
            'linguiça calabresa', 'carne de porco', 'bisteca suína', 'lombo suíno', 'pernil',
            # FRIOS E LATICÍNIOS
            'presunto', 'queijo', 'queijo mussarela', 'queijo prato', 'queijo minas', 'requeijão',
            'mortadela', 'salame', 'peito de peru', 'leite', 'leite integral', 'leite desnatado',
            'leite condensado', 'creme de leite', 'iogurte', 'manteiga', 'margarina',
            # PADARIA E MATINAIS
            'pão', 'pão de forma', 'pão francês', 'bisnaguinha', 'torrada', 'bolo',
            'cereal', 'granola', 'aveia', 'achocolatado', 'nescau', 'toddy',
            # BISCOITOS, SNACKS E DOCES
            'biscoito', 'bolacha', 'cream cracker', 'biscoito recheado', 'salgadinho',
            'batata palha', 'amendoim', 'chocolate', 'barra de cereal', 'doce', 'goiabada',
            'gelatina',
            # BEBIDAS
            'refrigerante', 'coca cola', 'guaraná', 'suco', 'suco em pó', 'água', 'água mineral',
            'água com gás', 'cerveja', 'vinho', 'energético', 'chá',
            # HIGIENE PESSOAL
            'sabonete', 'shampoo', 'condicionador', 'creme dental', 'pasta de dente',
            'escova de dente', 'fio dental', 'desodorante', 'papel higiênico',
            'absorvente', 'fralda', 'lenço umedecido',
            # LIMPEZA
            'sabão em pó', 'sabão líquido', 'amaciante', 'detergente', 'água sanitária',
            'desinfetante', 'multiuso', 'limpa vidro', 'esponja de aço', 'saco de lixo',
            'papel toalha',
            # PET SHOP
            'ração para cão', 'ração para gato', 'areia para gato',
        ]
        
        status_tracker.update({
            'status': 'RUNNING', 'startTime': time.time(),
            'progressPercent': 0, 'etaSeconds': -1,
            'currentMarket': '', 'totalMarkets': len(MERCADOS), 'marketsProcessed': 0,
            'currentProduct': '', 'totalProducts': len(NOMES_PRODUTOS), 'productsProcessedInMarket': 0,
            'totalItemsFound': 0, 'progresso': 'Iniciando...', 'produtos_lista': NOMES_PRODUTOS,
            'report': {'marketBreakdown': []}
        })
        
        total_registros_salvos = 0
        for mercado in MERCADOS:
            registros_salvos = await coletar_dados_mercado_com_timeout(mercado, token, supabase_client, status_tracker, coleta_id)
            total_registros_salvos += registros_salvos
            
        final_duration = time.time() - status_tracker['startTime']
        
        status_tracker['report']['totalDurationSeconds'] = round(final_duration)
        status_tracker['report']['totalItemsSaved'] = total_registros_salvos
        status_tracker['report']['endTime'] = datetime.now().isoformat()
        
        supabase_client.table('coletas').update({'status': 'concluida', 'finalizada_em': datetime.now().isoformat(), 'total_registros': total_registros_salvos}).eq('id', coleta_id).execute()
        
        status_tracker.update({ 'status': 'COMPLETED', 'progresso': f'Coleta #{coleta_id} finalizada!' })
        logging.info(f"Processo de coleta #{coleta_id} completo.")

    except Exception as e:
        logging.error(f"ERRO CRÍTICO na coleta: {e}")
        status_tracker.update({'status': 'FAILED', 'progresso': f'Coleta falhou: {e}'})
        if coleta_id != -1:
            supabase_client.table('coletas').update({'status': 'falhou', 'finalizada_em': datetime.now().isoformat()}).eq('id', coleta_id).execute()
