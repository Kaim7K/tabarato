# Extensao Ta Barato

Extensao Manifest V3 para capturar produtos, gerar artes e publicar ofertas pelo painel lateral. Requer Chrome 116 ou superior.

## Instalar localmente

1. Abra `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
2. Ative o modo do desenvolvedor.
3. Clique em **Carregar sem compactacao**.
4. Selecione a pasta `extension` deste projeto.
5. Abra uma pagina permitida e clique no icone flutuante do Ta Barato ou no icone da extensao.
6. No painel lateral, informe a URL publicada do Ta Barato e entre com o usuario administrativo.

## Configuracao de producao

Depois de instalar a extensao, copie o ID exibido pelo navegador e configure na Vercel:

```text
EXTENSION_ORIGIN=chrome-extension://ID_DA_EXTENSAO
```

Sem essa variavel, o servidor aceita origens com o formato oficial de extensoes Chrome. Definir a variavel restringe o acesso somente a instalacao publicada.

## Seguranca

- A chave `ADMIN_API_KEY` nunca e enviada para a extensao.
- O login retorna um token assinado valido por 24 horas.
- Produtos sao criados como `RASCUNHO`.
- A acao **Publicar agora** exige confirmacao, cria a oferta como `APROVADO` e envia pelo publicador existente do Telegram.
- **Enviar ao WhatsApp** reutiliza a aba aberta, entra no grupo configurado, preenche a legenda e cola pelo clipboard a arte gerada a partir da imagem original do produto.
- Ofertas enviadas pela extensao usam uma arte quadrada com foto, precos, desconto e as logos do Ta Barato e da loja. A mesma arte e reutilizada no Telegram, WhatsApp e compartilhamento do site.
- O botao **Painel** no cabecalho abre ou reutiliza a aba administrativa mesmo quando nenhum produto foi capturado.
- Scripts de captura so executam nas lojas nativas, no WhatsApp, no site e nos dominios de lojas sincronizados pelo painel.
- O link capturado deve ser revisado, pois algumas lojas nao disponibilizam automaticamente o link pessoal de afiliado no HTML.

## Mercado Livre

Ao capturar um produto, a extensao procura o link curto criado pelo programa de afiliados. Se necessario, ela aciona **Compartilhar**, aguarda o modal **Gerar link / ID de produto** e captura o campo no formato `https://meli.la/...`.

Ofertas do Mercado Livre nao podem ser salvas pela extensao com a URL comum do produto. Caso a conta ou a pagina nao disponibilize o gerador, abra o modal manualmente e cole o `meli.la` no campo de afiliado.

A descricao capturada usa somente o primeiro paragrafo encontrado na pagina ou nos metadados do produto.

A extensao prioriza o preco final exibido explicitamente como **com cupom**, captura codigos quando disponiveis e mantem uma orientacao de ativacao quando a loja nao revela o codigo. O comando **Ativar cupons** abre a pagina do Mercado Livre e ativa a quantidade escolhida.

No modo **Lote**, inicie o processo na pagina que exibe os produtos. A extensao fixa essa pagina como origem, elimina rotas duplicadas por ID, reutiliza uma unica aba de leitura e ignora automaticamente produtos sem preco, imagem ou link de afiliado confiavel. O botao **Parar** fecha a aba de leitura e cancela o envio ao WhatsApp em andamento.

## Paginas e painel

- O painel e unico por janela e preserva o produto ao alternar entre paginas permitidas.
- Em paginas nao permitidas, o botao flutuante e removido, a acao fica desabilitada e o painel e fechado quando a API do navegador permite.
- Lojas conectadas sao registradas dinamicamente a partir das categorias e ofertas sincronizadas com o site.

## Recuperacao de erros

- Capturas, APIs, imagens e mensagens entre abas possuem tempo limite.
- Uma falha preserva os dados que ja estavam no formulario e libera imediatamente uma nova tentativa.
- Promessas de imagem com erro nao ficam armazenadas no cache da extensao.
- Os scripts podem ser reinjetados sem duplicar listeners, botoes ou intervalos.
- Envios expirados ao WhatsApp sao cancelados antes de novos cliques no campo de mensagem.
- O ultimo erro tecnico fica registrado apenas em `chrome.storage.session`, sem produto, token ou credencial.
