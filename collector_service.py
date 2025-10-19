import asyncio
import aiohttp
import hashlib
from datetime import datetime, timedelta
import logging
import time
from typing import Dict, Any, List, Optional
import unicodedata

# --- Configurações Otimizadas ---
ECONOMIZA_ALAGOAS_API_URL = 'http://api.sefaz.al.gov.br/sfz-economiza-alagoas-api/api/public/produto/pesquisa'
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

def remover_acentos(texto: str) -> str:
    """Remove acentos e caracteres especiais do texto"""
    if not texto: return ""
    return ''.join(
        c for c in unicodedata.normalize('NFD', texto)
        if unicodedata.category(c) != 'Mn'
    ).lower()

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
async def consultar_produto(produto: str, mercado: Dict[str, str], data_coleta: str, token: str, coleta_id: int, dias_pesquisa: int = 3) -> List[Dict[str, Any]]:
    cnpj = mercado['cnpj']
    pagina = 1
    todos_os_itens = []
    async with aiohttp.ClientSession() as session:
        while True:
            request_body = {
                "produto": {"descricao": produto.upper()}, 
                "estabelecimento": {"individual": {"cnpj": cnpj}},
                "dias": dias_pesquisa, 
                "pagina": pagina, 
                "registrosPorPagina": REGISTROS_POR_PAGINA
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
            logging.info(f"Coletado: {mercado['nome']} - '{produto}' - Página {pagina}/{total_paginas} - Itens: {len(conteudo)} - Dias: {dias_pesquisa}")
            if pagina >= total_paginas: break
            pagina += 1
    return todos_os_itens

# FUNÇÃO PARA BUSCA EM TEMPO REAL (MANTÉM 3 DIAS FIXOS)
async def consultar_produto_realtime(produto: str, mercado: Dict[str, str], data_coleta: str, token: str, coleta_id: int) -> List[Dict[str, Any]]:
    """
    Função específica para busca em tempo real - SEMPRE usa 3 dias
    """
    return await consultar_produto(produto, mercado, data_coleta, token, coleta_id, dias_pesquisa=3)

async def coletar_dados_mercado(mercado: Dict[str, Any], token: str, supabase_client: Any, status_tracker: Dict[str, Any], coleta_id: int, dias_pesquisa: int):
    produtos_a_buscar = status_tracker['produtos_lista']
    total_produtos = len(produtos_a_buscar)
    registros_salvos_neste_mercado = 0
    status_tracker['currentMarket'] = mercado['nome']
    status_tracker['productsProcessedInMarket'] = 0
    
    async def task_wrapper(prod, index):
        status_tracker['currentProduct'] = prod
        status_tracker['productsProcessedInMarket'] = index + 1
        resultados = await consultar_produto(prod, mercado, datetime.now().isoformat(), token, coleta_id, dias_pesquisa)
        if resultados:
            status_tracker['totalItemsFound'] += len(resultados)
        return resultados

    tasks = [task_wrapper(produto, i) for i, produto in enumerate(produtos_a_buscar)]
    resultados_por_produto = await asyncio.gather(*tasks)
    
    resultados_finais = [item for sublist in resultados_por_produto for item in sublist]
    registros_unicos = {registro['id_registro']: registro for registro in resultados_finais}
    resultados_unicos_lista = list(registros_unicos.values())
    
    logging.info(f"COLETA PARA '{mercado['nome']}': {len(resultados_finais)} brutos -> {len(resultados_unicos_lista)} únicos. (Dias: {dias_pesquisa})")
    
    if resultados_unicos_lista:
        dados_para_db = [{k: v for k, v in item.items() if k != 'id_produto'} for item in resultados_unicos_lista]
        try:
            supabase_client.table('produtos').upsert(dados_para_db, on_conflict='id_registro').execute()
            registros_salvos = len(dados_para_db)
            logging.info(f"-----> SUPABASE SUCESSO: {registros_salvos} salvos para {mercado['nome']}.")
        except Exception as e:
            logging.error(f"-----> SUPABASE ERRO: Falha ao salvar para {mercado['nome']}: {e}")
            
    return registros_salvos

async def coletar_dados_mercado_com_timeout(mercado: Dict[str, Any], token: str, supabase_client: Any, status_tracker: Dict[str, Any], coleta_id: int, dias_pesquisa: int):
    start_time_market = time.time()
    registros_salvos = 0
    try:
        registros_salvos = await asyncio.wait_for(
            coletar_dados_mercado(mercado, token, supabase_client, status_tracker, coleta_id, dias_pesquisa),
            timeout=TIMEOUT_POR_MERCADO_SEGUNDOS
        )
    except asyncio.TimeoutError:
        logging.error(f"TIMEOUT! Coleta para {mercado['nome']} excedeu {TIMEOUT_POR_MERCADO_SEGUNDOS / 60} min.")
    
    end_time_market = time.time()
    duration_market = end_time_market - start_time_market
    
    status_tracker['report']['marketBreakdown'].append({
        "marketName": mercado['nome'], 
        "itemsFound": registros_salvos, 
        "duration": round(duration_market, 2),
        "diasPesquisa": dias_pesquisa
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
    status_tracker['progresso'] = f"Processado {mercado['nome']} ({markets_processed}/{total_markets}) - {dias_pesquisa} dias"
    return registros_salvos

async def run_full_collection(
    supabase_client: Any, 
    token: str, 
    status_tracker: Dict[str, Any],
    selected_markets: Optional[List[str]] = None,
    dias_pesquisa: int = 3
):
    """
    Executa coleta completa com opções flexíveis
    
    Args:
        supabase_client: Cliente Supabase
        token: Token de autenticação
        status_tracker: Tracker de status
        selected_markets: Lista de CNPJs dos mercados a coletar (None = todos)
        dias_pesquisa: Número de dias para pesquisa (1 a 7)
    """
    logging.info(f"Iniciando processo de coleta completa - Mercados: {len(selected_markets) if selected_markets else 'Todos'}, Dias: {dias_pesquisa}")
    coleta_id = -1
    
    # Validar dias de pesquisa (1 a 7)
    if dias_pesquisa not in range(1, 8):
        logging.warning(f"Dias de pesquisa inválido: {dias_pesquisa}. Usando padrão: 3")
        dias_pesquisa = 3
    
    try:
        # Criar registro de coleta
        coleta_registro = supabase_client.table('coletas').insert({
            'dias_pesquisa': dias_pesquisa,
            'mercados_selecionados': selected_markets
        }).execute()
        coleta_id = coleta_registro.data[0]['id']
        logging.info(f"Novo registro de coleta criado com ID: {coleta_id} - Dias: {dias_pesquisa}")
        
        # Buscar mercados (todos ou apenas os selecionados) - SEM ENDEREÇO
        query = supabase_client.table('supermercados').select('nome, cnpj')
        if selected_markets:
            query = query.in_('cnpj', selected_markets)
        
        response = query.execute()
        if not response.data: 
            raise Exception("Nenhum supermercado encontrado para coleta.")
        
        MERCADOS = response.data
        logging.info(f"Mercados selecionados para coleta: {len(MERCADOS)}")
        
        # LISTA COMPLETA DE PRODUTOS SEM ACENTOS
        NOMES_PRODUTOS = [
           # MERCEARIA
    'arroz', 'feijao', 'acucar', 'adocante', 'sal', 'oleo', 'azeite', 'vinagre', 
    'cafe', 'farinha', 'fubá', 'amido', 'macarrao', 'massa', 'molho', 'extrato', 
    'polpa', 'milho', 'ervilha', 'seleta', 'palmito', 'azeitona', 'conserva', 
    'atum', 'sardinha', 'maionese', 'ketchup', 'mostarda', 'caldo', 'tempero', 
    'pimenta', 'cominho', 'acafrao', 'paprica', 'orégano', 'manjericao', 'salsa', 
    'cebolinha', 'dende', 'coco', 'fermento', 'gelatina', 'rapadura', 'mel', 
    'geleia', 'mocoto', 'paçoca', 'amendoim', 'castanha', 'amendoa', 'nozes', 
    'passas', 'damasco', 'ameixa', 'figo', 'tamara', 'bala', 'bombom', 'chocolate', 
    'achocolatado',

    # HORTIFRÚTI
    'alho', 'cebola', 'batata', 'mandioca', 'tomate', 'cenoura', 'beterraba', 
    'chuchu', 'pepino', 'pimentao', 'abobora', 'abobrinha', 'berinjela', 'jilo', 
    'maxixe', 'quiabo', 'vagem', 'brocolis', 'couve', 'alface', 'rucula', 'agriao', 
    'espinafre', 'acelga', 'coentro', 'hortela', 'alecrim', 'tomilho', 'louro', 
    'gengibre', 'banana', 'maca', 'pera', 'uva', 'mamao', 'melancia', 'melao', 
    'abacaxi', 'manga', 'limao', 'laranja', 'tangerina', 'bergamota', 'caju', 
    'goiaba', 'maracuja', 'caqui', 'kiwi', 'carambola', 'jabuticaba', 'pitanga', 
    'seriguela', 'coco', 'ovos',

    # AÇOUGUE
    'carne', 'bife', 'file', 'picanha', 'alcatra', 'coxao', 'patinho', 'maminha', 
    'cupim', 'costela', 'paleta', 'acém', 'musculo', 'hamburguer', 'linguica', 
    'salsicha', 'paio', 'salame', 'presunto', 'prosciutto', 'bisteca', 'lombo', 
    'pernil', 'panceta', 'toucinho', 'bacon', 'carneiro', 'cordeiro', 'frango', 
    'peito', 'coxa', 'sobrecoxa', 'asa', 'coracao', 'figado', 'moela', 'peru', 
    'chester', 'faisao', 'codorna', 'coelho',

    # FRIOS E LATICÍNIOS
    'presunto', 'queijo', 'mussarela', 'prato', 'minas', 'coalho', 'provolone', 
    'parmesao', 'gorgonzola', 'brie', 'camembert', 'cheddar', 'cream', 'cottage', 
    'ricota', 'requeijao', 'mortadela', 'apresuntado', 'peito', 'blanquet', 
    'leite', 'creme', 'nata', 'chantilly', 'iogurte', 'coalhada', 'manteiga', 
    'margarina',

    # PADARIA
    'pao', 'frances', 'forma', 'integral', 'doce', 'queijo', 'batata', 'hot', 
    'hamburguer', 'sirio', 'italiano', 'australiano', 'bisnaguinha', 'croissant', 
    'baguete', 'focaccia', 'ciabatta', 'torrada', 'bolo', 'rosquinha', 'donuts', 
    'sonho', 'pastel', 'empada', 'torta', 'cereal', 'granola', 'aveia', 'musli', 
    'biscoito', 'bolacha',

    # BEBIDAS
    'refrigerante', 'agua', 'gas', 'mineral', 'coco', 'suco', 'néctar', 'isotonica', 
    'energetico', 'cafe', 'cha', 'mate', 'erva', 'chimarrão', 'cerveja', 'vinho', 
    'champagne', 'whisky', 'vodka', 'rum', 'cachaca', 'gin', 'tequila', 'conhaque', 
    'licor', 'aperitivo', 'vermute',

    # HIGIENE
    'sabonete', 'shampoo', 'condicionador', 'creme', 'mascara', 'finalizador', 
    'gel', 'pomada', 'spray', 'dental', 'escova', 'fio', 'enxaguante', 'protese', 
    'aparelho', 'desodorante', 'perfume', 'colonia', 'hidratante', 'protetor', 
    'bronzeador', 'pos', 'maquiagem', 'base', 'po', 'blush', 'batom', 'lapis', 
    'rimel', 'delineador', 'sombra', 'corretivo', 'iluminador', 'pincel', 'esponja', 
    'algodao', 'cotonete', 'lenco', 'papel', 'toalha', 'guardanapo', 'fralda', 
    'pomada', 'absorvente', 'coletor', 'calcinha',

    # LIMPEZA
    'sabao', 'amaciante', 'alvejante', 'sanitária', 'oxigenada', 'alcool', 
    'detergente', 'vidros', 'multiuso', 'desinfetante', 'lustra', 'cera', 
    'polidor', 'carpetes', 'tapetes', 'manchas', 'forno', 'piso', 'banheiro', 
    'vaso', 'saca', 'desentupidor', 'inseticida', 'repelente', 'aromatizador', 
    'desodorizador', 'spray', 'difusor', 'vela', 'incenso', 'sache', 'esponja', 
    'palha', 'bucha', 'luvas', 'saco', 'lixo', 'plastico', 'biodegradavel', 
    'toalha', 'rodo', 'vassoura', 'pá', 'balde', 'esfregão', 'pano', 'flanela', 
    'microfibra',

    # PET
    'racao', 'caes', 'gatos', 'seca', 'umida', 'premium', 'veterinary', 'filhote', 
    'adulto', 'idoso', 'porte', 'light', 'hipoalergenica', 'petisco', 'biscoito', 
    'ossinho', 'palito', 'brinquedo', 'interativo', 'bola', 'pelucia', 'arranhador', 
    'caixa', 'guia', 'coleira', 'peitoral', 'cama', 'casinha', 'tapete', 'areia', 
    'sanitária', 'silica', 'shampoo', 'condicionador', 'perfume', 'antipulgas', 
    'carrapaticida', 'vermifugo', 'vitamina', 'suplemento', 'medicamento', 'seringa', 
    'curativo', 'algodao',

    # OUTROS
    'pilha', 'carregador', 'lampada', 'vela', 'isqueiro', 'fosforo', 'fita', 
    'cola', 'adesivo', 'envelope', 'papel', 'caderno', 'agenda', 'caneta', 'lapis', 
    'borracha', 'apontador', 'tesoura', 'estilete', 'furador', 'grampeador', 
    'clips', 'elastico', 'pasta', 'arquivo', 'organizador', 'caixa', 'saco', 
    'plastico', 'aluminio', 'forma', 'pote', 'tampa', 'vasilha', 'tupperware', 
    'termica', 'isopor', 'prato', 'copo', 'talher', 'guardanapo', 'toalha', 
    'rolo', 'sacola', 'retornavel'
        ]
        
        # Aplicar remoção de acentos em todos os produtos
        NOMES_PRODUTOS_SEM_ACENTOS = [remover_acentos(produto) for produto in NOMES_PRODUTOS]
        
        # Atualizar status tracker
        status_tracker.update({
            'status': 'RUNNING', 
            'startTime': time.time(),
            'progressPercent': 0, 
            'etaSeconds': -1,
            'currentMarket': '', 
            'totalMarkets': len(MERCADOS), 
            'marketsProcessed': 0,
            'currentProduct': '', 
            'totalProducts': len(NOMES_PRODUTOS_SEM_ACENTOS), 
            'productsProcessedInMarket': 0,
            'totalItemsFound': 0, 
            'progresso': f'Iniciando coleta - {len(MERCADOS)} mercados, {dias_pesquisa} dias', 
            'produtos_lista': NOMES_PRODUTOS_SEM_ACENTOS,
            'report': {
                'marketBreakdown': [],
                'diasPesquisa': dias_pesquisa,
                'mercadosSelecionados': [m['cnpj'] for m in MERCADOS]  # Apenas CNPJs
            }
        })
        
        total_registros_salvos = 0
        for mercado in MERCADOS:
            registros_salvos = await coletar_dados_mercado_com_timeout(
                mercado, token, supabase_client, status_tracker, coleta_id, dias_pesquisa
            )
            total_registros_salvos += registros_salvos
            
        final_duration = time.time() - status_tracker['startTime']
        
        status_tracker['report']['totalDurationSeconds'] = round(final_duration)
        status_tracker['report']['totalItemsSaved'] = total_registros_salvos
        status_tracker['report']['endTime'] = datetime.now().isoformat()
        
        # Atualizar registro da coleta
        supabase_client.table('coletas').update({
            'status': 'concluida', 
            'finalizada_em': datetime.now().isoformat(), 
            'total_registros': total_registros_salvos
        }).eq('id', coleta_id).execute()
        
        status_tracker.update({ 
            'status': 'COMPLETED', 
            'progresso': f'Coleta #{coleta_id} finalizada! {total_registros_salvos} registros - {dias_pesquisa} dias'
        })
        logging.info(f"Processo de coleta #{coleta_id} completo. Registros: {total_registros_salvos}, Dias: {dias_pesquisa}")

    except Exception as e:
        logging.error(f"ERRO CRÍTICO na coleta: {e}")
        status_tracker.update({
            'status': 'FAILED', 
            'progresso': f'Coleta falhou: {e}'
        })
        if coleta_id != -1:
            supabase_client.table('coletas').update({
                'status': 'falhou', 
                'finalizada_em': datetime.now().isoformat()
            }).eq('id', coleta_id).execute()

