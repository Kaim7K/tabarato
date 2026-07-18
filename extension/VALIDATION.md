# Validacao da extensao 3.1.2

Este documento registra o que foi efetivamente validado nesta revisao e separa os fluxos que ainda dependem das contas reais do usuario.

## Validacoes automatizadas

Comandos executados com sucesso:

```text
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
```

A suite cobre manifest e arquivos referenciados, sintaxe JavaScript, seletores e eventos do painel, autenticacao, captura, cupons, precos, URLs em lote, publicacao, Telegram, WhatsApp, clipboard, seguranca de rotas, banco de dados e build do site.

Resultado desta revisao: 81 testes aprovados, zero falhas, lint aprovado, typecheck aprovado, build Vite aprovado e nenhuma vulnerabilidade encontrada pelo `npm audit --omit=dev`.

Tambem foram executadas 42.501 verificacoes deterministicas de carga com 5.000 precos brasileiros, 5.000 precos em formato internacional, 5.000 combinacoes de preco anterior, 5.000 cupons e 5.000 URLs de produtos em lote.

## Teste controlado do painel

O painel lateral foi executado em Chromium com APIs do Chrome e respostas do servidor controladas. Foram validados:

- inicializacao desconectada;
- login e captura automatica do produto atual;
- alternancia de tema;
- cadastro de grupos;
- ativacao e interrupcao de cupons;
- modos individual e lote;
- captura, salvamento e publicacao;
- envio ao WhatsApp;
- mensagem personalizada;
- inicio e interrupcao do lote;
- logout;
- ausencia de excecoes e erros de console no cenario.

A instalacao descompactada completa nao foi carregada nesta execucao porque o Chromium disponivel no ambiente bloqueou a navegacao e a instalacao por politica administrativa. Por isso, nenhum fluxo autenticado externo foi declarado como confirmado sem evidencia.

## Erros encontrados e corrigidos

- Valores com uma casa decimal, como `4847.8`, podiam ser interpretados como `48478` tanto no painel quanto na API.
- Depois do primeiro login, o produto atual nao era capturado automaticamente e exigia um clique manual em atualizar.
- O botao de afiliado `Compartilhar` do Mercado Livre podia nao ser encontrado quando aparecia somente como icone com `aria-label` ou `title`.
- O envio em lote descartava o produto logo apos a primeira falha de leitura do `meli.la`. Agora abre ate cinco produtos em paralelo, exige tres leituras estaveis de nome, preco e imagem, ativa cada aba antes da extracao, aguarda o componente de afiliados, reabre o modal e faz recarga controlada antes de desistir.
- O diagnostico repetia `link de afiliado` e `link meli.la` para a mesma falha. Agora exibe apenas `link afiliado meli.la`.
- O WhatsApp tentava novamente o clipboard offscreen mesmo quando o painel ja havia copiado a imagem corretamente.
- O lint falhava por codigo abandonado no extrator do Mercado Livre.
- A documentacao dizia que o fallback offscreen havia sido removido, embora ele ainda existisse.

## Validacao manual obrigatoria

Estes fluxos dependem de sessoes e destinos reais e devem ser conferidos na instalacao do usuario:

- geracao do link `meli.la` na conta de afiliado;
- ativacao real de cupons em conta autenticada do Mercado Livre;
- publicacao real no site e no canal do Telegram;
- envio sequencial para grupos reais do WhatsApp;
- lote completo com produtos reais e reconciliacao no banco;
- recuperacao da sessao depois de fechar e reabrir o navegador.

A versao somente deve ser considerada totalmente validada em producao depois desse teste final autenticado.

## Versao 3.1.3

- Removido o `scrollIntoView` usado na abertura do painel de afiliados do Mercado Livre.
- A pagina agora e fixada no topo antes de localizar ou clicar em `Compartilhar`.
- O lote repete a fixacao no topo depois de qualquer recarga da aba.
- Botoes genericos de compartilhamento fora da regiao superior deixaram de ser tratados como controle de afiliado.
- A captura do `meli.la` continua sendo a primeira etapa antes de cupom, pagamento e demais dados.

## Versao 3.1.4

- O lote extrai o ID oficial do produto diretamente da URL e consulta o historico antes de criar qualquer aba.
- Produtos ja publicados sao ignorados no inicio do lote e aparecem no log como `Ja publicado, nao foi aberto`.
- A consulta considera status publicado, data de publicacao, mensagem do Telegram e historico de publicacao bem-sucedido.
- O Mercado Livre reconhece codigos visiveis no formato `Com CODIGO` dentro da area de preco ou cupom.
- Quando existe preco com cupom ou cupom selecionavel, mas nenhum codigo aparece, a mensagem usa `disponível no anúncio. Ative antes de comprar.`.
- O mesmo aviso e usado quando o cupom ja esta aplicado, mas o Mercado Livre nao revela o codigo.
