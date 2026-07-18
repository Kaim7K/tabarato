# Validacao da extensao 3.1.1

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

Resultado desta revisao: 80 testes aprovados, zero falhas, lint aprovado, typecheck aprovado, build Vite aprovado e nenhuma vulnerabilidade encontrada pelo `npm audit --omit=dev`.

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
- O envio em lote descartava o produto logo apos a primeira falha de leitura do `meli.la`. Agora aguarda o carregamento tardio do componente, reabre o modal, le campos, atributos e textos, tenta novamente e faz uma recarga controlada antes de desistir.
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
