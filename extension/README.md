# Extensao Ta Barato

Extensao Chrome Manifest V3 para capturar produtos, gerar artes e publicar ofertas pelo painel lateral. A versao 3 requer Chrome 141 ou superior porque fecha o painel lateral ao sair de uma pagina permitida.

## Instalar localmente

1. Abra `chrome://extensions`.
2. Ative o modo do desenvolvedor.
3. Clique em **Carregar sem compactacao**.
4. Selecione a pasta `extension`.
5. Abra uma pagina permitida e clique no icone da extensao ou no botao flutuante.
6. Entre com a conta administrativa do site.

O endereco padrao e `https://www.tabaratoofertas.shop`. Instalacoes antigas que ainda guardam o dominio da Vercel sao migradas automaticamente.

## Estrutura

```text
extension/
  assets/                    Identidade visual, logos e fontes locais
  background/
    service-worker.js        Entrada e roteamento de mensagens
    access.js                Dominios, acao, painel e scripts dinamicos
    coupons.js               Operacao confiavel de cupons via Debugger API
    whatsapp.js              Fila, cancelamento e navegacao por grupos
  content/
    index.js                 Inicializacao, launcher e captura da pagina
    shared.js                Extratores e normalizadores compartilhados
    coupons.js               Automacao da tela de cupons
    whatsapp.js              Automacao do WhatsApp Web
    stores/                  Adaptadores Mercado Livre, Shopee e lojas conectadas
  shared/                    Runtime, configuracao e validacao de cupom
  sidepanel/
    app.js                   Inicializacao e eventos da interface
    modules/                 API, catalogo, produto, captura, midia e publicacao
    artwork.js               Geracao da arte quadrada
    product-utils.js         Precos, texto e regras de produto
    batch-utils.js           Normalizacao de rotas do lote
```

## Permissoes

- `sidePanel`, `tabs`, `scripting` e `activeTab`: exibicao do painel e leitura somente nas paginas permitidas.
- `storage`: sessao administrativa, grupos, preferencias e ultimo rascunho.
- `clipboardRead` e `clipboardWrite`: copia da arte PNG pelo painel focado e, se necessario, pela aba ativa do WhatsApp.
- `debugger`: cliques confiaveis nos botoes **Aplicar** da pagina de cupons. A operacao anexa apenas a aba de cupons e sempre remove o debugger ao terminar ou falhar.
- `https://*/*`: imagens externas, API publicada e lojas conectadas dinamicamente. Os content scripts estaticos continuam restritos aos dominios declarados; novos dominios sao registrados somente depois da sincronizacao com o site.

## Comportamento

- O painel e unico por janela e o rascunho persiste ao alternar entre abas permitidas, fechar o painel ou reiniciar o navegador.
- Fora do site, WhatsApp ou lojas permitidas, a acao e desativada, o launcher nao e criado e o painel e fechado.
- Mercado Livre prioriza o valor explicito com cupom. O preco normal vira preco anterior quando nao existe outro valor anterior valido.
- Um texto so vira cupom quando possui contexto explicito, como `Com MELIMODA` ou `Cupom: MELIMODA`. Categorias e nomes de produto nao sao aceitos como codigo.
- A mensagem omite cupom e frete quando essas informacoes nao foram confirmadas. Parcelamento, Pix e frete nao sao duplicados.
- Mercado Livre exige um link `meli.la` realmente gerado pela conta de afiliado. A URL comum nao e convertida nem apresentada como link de afiliado.
- No envio em lote, a extensao abre ate cinco produtos por vez em abas de pre-carregamento. Cada pagina precisa manter nome, preco e imagem estaveis em tres verificacoes consecutivas antes da leitura. Depois, a aba e ativada, o componente de afiliados recebe tempo para montar e o `meli.la` passa por recuperacao e recarga controlada antes de ser considerado indisponivel.
- Antes de abrir as abas do lote, a extensao consulta o ID do produto no historico do site. Itens ja publicados sao descartados sem carregar novamente a pagina.
- No Mercado Livre, `Com CODIGO` vira o codigo real do cupom. Quando ha cupom ou preco com cupom sem codigo visivel, a mensagem usa `disponível no anúncio. Ative antes de comprar.`.
- Todos os dialogs abertos pela captura sao fechados no bloco de finalizacao do adaptador.
- O lote elimina rotas repetidas, trabalha em janelas de cinco abas, coleta uma por vez enquanto as seguintes carregam em paralelo e fecha cada aba imediatamente depois da publicacao.
- WhatsApp usa a imagem copiada no clipboard do sistema. A extensao nao simula upload por campo de arquivo.

## Producao

Depois de instalar a extensao, copie o ID exibido pelo Chrome e configure na Vercel:

```text
EXTENSION_ORIGIN=chrome-extension://ID_DA_EXTENSAO
```

A chave `ADMIN_API_KEY` permanece apenas no servidor. O login da extensao recebe um token temporario, nunca a chave administrativa.

## Diagnostico

Falhas operacionais possuem tempo limite e liberam a interface para nova tentativa. O ultimo erro tecnico e guardado em `chrome.storage.session` sob `tabarato_last_extension_error`, sem senha, token, HTML capturado ou dados completos do produto. A versao de producao nao possui `console.log`, `console.debug` ou `console.warn`.

Consulte [VALIDATION.md](./VALIDATION.md) para a matriz de testes e as validacoes manuais que dependem de contas autenticadas.
