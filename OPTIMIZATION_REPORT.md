# Relatório de otimização — Tá Barato v3.2.0

## Resultado medido

| Indicador | Antes | Depois | Resultado |
|---|---:|---:|---:|
| Arquivos públicos estáticos | ~1,6 MB | 576 KB | redução aproximada de 64% |
| Tempo de build local | 4,31 s | 3,49 s | cerca de 19% mais rápido* |
| JavaScript principal compactado | 73,83 KB | 74,04 KB | praticamente estável |
| Testes automatizados | 84 | 88 | todos aprovados |
| Verificações determinísticas de carga | 42.501 | 42.501 | todas aprovadas |
| Vulnerabilidades de produção | 0 | 0 | nenhuma encontrada |

\* O tempo de build varia conforme máquina, cache e carga do ambiente. A comparação usa execuções locais no mesmo projeto.

## Extensão

- Fila contínua com no máximo cinco abas em carregamento, sem esperar um bloco inteiro terminar.
- Cada aba é fechada logo após a leitura e a próxima começa a carregar enquanto o produto atual é publicado.
- A captura aguarda estabilidade real de título, preço e imagem por observação do DOM.
- A consulta ao histórico ocorre antes da abertura de abas, evitando trabalho repetido.
- Catálogo compacto com cache curto e índices em memória para produto, URL, nome e status publicado.
- A arte é gerada uma vez e reutilizada no site, Telegram e WhatsApp.
- O WhatsApp recebe a imagem pesada somente no primeiro grupo e reutiliza o arquivo em memória nos demais.
- Esperas fixas desnecessárias foram substituídas por detecção do estado real da interface.

## Site e frontend

- Busca sob demanda com debounce de 180 ms, cancelamento de requisição anterior e máximo de seis resultados.
- Favoritos, comparação e alertas consultam somente os IDs necessários.
- Alertas pausam consultas quando a aba está oculta.
- Detalhes da oferta são exibidos antes da busca por recomendações relacionadas.
- Cálculos de seções da página inicial foram memorizados para evitar recomputações.
- Imagens principais foram convertidas para WebP com fallback quando necessário.

## APIs e banco de dados

- Inicialização do esquema versionada e protegida por advisory lock do PostgreSQL.
- O caminho normal executa somente uma verificação leve em vez de repetir toda a criação e alteração do banco.
- Índices adicionados para ofertas recentes, categorias, plataformas, cliques, histórico e pesquisa textual.
- Pesquisa textual usa índice trigram com normalização de acentos.
- Listagens públicas podem ignorar a contagem total quando a tela não precisa dela.
- Painel da extensão recebe uma resposta compacta, sem métricas e agregações desnecessárias.
- Registro de visitante e evento de analytics foi unido em uma única consulta.
- Limite de corpo HTTP é aplicado durante a leitura do fluxo, reduzindo risco de uso excessivo de memória.

## Limite da validação

Os testes locais confirmam a estrutura, os parsers, a fila, o cache, as APIs e os principais fluxos controlados. A operação real em contas autenticadas do Mercado Livre, Telegram e grupos do WhatsApp ainda deve ser conferida depois da instalação, porque depende da sessão, dos componentes exibidos para a conta e de mudanças externas dessas plataformas.
