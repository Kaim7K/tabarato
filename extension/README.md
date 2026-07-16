# Extensao Ta Barato

Extensao Manifest V3 para capturar produtos no Mercado Livre, Amazon e Shopee e criar rascunhos no painel administrativo.

## Instalar localmente

1. Abra `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
2. Ative o modo do desenvolvedor.
3. Clique em **Carregar sem compactacao**.
4. Selecione a pasta `extension` deste projeto.
5. Abra uma pagina de produto compativel e clique em **Enviar produto**.
6. Informe a URL publicada do Ta Barato e entre com o usuario administrativo.

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
- **Enviar ao WhatsApp** reutiliza a aba aberta, entra no grupo configurado, preenche a legenda e cola pelo clipboard a imagem original do produto.
- O botao **Painel** no cabecalho abre ou reutiliza a aba administrativa mesmo quando nenhum produto foi capturado.
- O botao **Enviar mensagem agendada** busca a proxima mensagem de WhatsApp vencida, envia texto e imagem e confirma o resultado no painel.
- A extensao pede acesso apenas ao dominio configurado pelo administrador.
- O link capturado deve ser revisado, pois algumas lojas nao disponibilizam automaticamente o link pessoal de afiliado no HTML.

## Mensagens agendadas

- Mensagens de Telegram sao enviadas automaticamente pelo cron do site.
- Mensagens de WhatsApp ficam prontas no horario configurado e precisam do botao manual da extensao, pois usam o WhatsApp Web aberto no navegador.
- O grupo definido na mensagem tem prioridade; quando estiver vazio, a extensao usa o grupo padrao salvo no painel lateral.

## Mercado Livre

Ao clicar em **Enviar produto**, a extensao procura o link curto criado pelo programa de afiliados. Se necessario, ela aciona **Compartilhar**, aguarda o modal **Gerar link / ID de produto** e captura o campo no formato `https://meli.la/...`.

Ofertas do Mercado Livre nao podem ser salvas pela extensao com a URL comum do produto. Caso a conta ou a pagina nao disponibilize o gerador, abra o modal manualmente e cole o `meli.la` no campo de afiliado.

A descricao capturada usa somente o primeiro paragrafo encontrado na pagina ou nos metadados do produto.

No Mercado Livre, a extensao tambem identifica cupons vinculados ao produto e promocoes de pagamento. Para produtos acima de R$ 500, consulta as opcoes exibidas de parcelamento sem juros e adiciona essas informacoes ao texto complementar da oferta.
