# Validacao da extensao 3.0.0

Este documento separa testes automatizados, testes reais executados em Chromium isolado e fluxos que dependem de uma conta autenticada do usuario.

## Testes automatizados

Os comandos finais executados foram:

```text
npm test
npm run lint
npm run typecheck
npm run build
```

A suite cobre manifest e arquivos referenciados, sintaxe de todo JavaScript, seletores do painel, dominios permitidos, migracao do dominio, parser de cupons, regras de preco, frete, texto de mensagem, arte, clipboard, WhatsApp, lote, painel lateral e timeouts.

Resultado da ultima execucao: 74 testes aprovados, zero falhas, lint aprovado, typecheck aprovado e build Vite aprovado.

## Testes reais executados

- Carregamento da extensao descompactada em Chromium isolado.
- Inicializacao do service worker Manifest V3 e dos modulos de background.
- Abertura e renderizacao do painel lateral em viewport estreito.
- Habilitacao da acao e do painel em pagina do Mercado Livre.
- Desabilitacao da acao e do painel em dominio nao permitido.
- Captura repetida de produto publico real do Mercado Livre.
- Leitura de nome, precos, imagens, parcelamento e frete conforme o conteudo visivel.
- Rejeicao de descricao vazia, pontuacao isolada e titulo `Descricao` como paragrafo.
- Ausencia de cupom quando a pagina nao apresenta um codigo explicito.
- Ausencia de link afiliado inventado em perfil sem sessao de afiliado.
- Inicializacao do painel sem usuario ficticio preenchido.
- Login controlado da extensao e sincronizacao de categorias retornadas pela API.
- Persistencia do produto ao recarregar o painel e alternar entre abas.
- Correcao de preco anterior menor que o preco atual usando o preco normal.
- Remocao de `Fralda` do campo de cupom por falta de contexto explicito.
- Geracao real de arte PNG com 1080x1080 e 92.431 bytes no cenario controlado.
- Escrita real da arte PNG no clipboard pelo painel focado, confirmada pelo Chrome.
- Alternancia entre os temas claro e escuro.
- Verificacao de excecoes e erros de console nos contextos do painel e service worker.

O teste real foi executado em Chromium 149 com um perfil isolado. O service worker 3.0.0 permaneceu ativo, a captura publica retornou nome, preco atual, preco anterior e imagens, a acao foi desativada em `example.com`, nao houve erro de painel e `tabarato_last_extension_error` permaneceu vazio.

## Erros encontrados e corrigidos

- O painel e o service worker concentravam responsabilidades demais. Foram reduzidos a entradas de 156 e 87 linhas e passaram a delegar para modulos por dominio.
- A descricao do Mercado Livre aceitava `.` e depois o titulo `Descricao`. O extrator agora exige um paragrafo com conteudo e quantidade minima de palavras.
- `Fralda` podia chegar ao campo de cupom. O parser agora exige marcador explicito e formato plausivel de codigo.
- Um preco anterior menor que o atual podia ser restaurado do rascunho. O formulario recalcula o valor com `regularPrice` tanto na captura quanto na restauracao.
- Parcelamento, frete e percentual de desconto podiam aparecer duplicados no texto. A normalizacao agora remove desconto textual e deduplica beneficios.
- O timeout do WhatsApp encerrava a espera, mas a operacao podia continuar. O cancelamento agora interrompe a fila e avisa o content script.
- A copia pelo documento offscreen falhou no teste real com `Document is not focused`. Esse caminho foi removido. A copia acontece primeiro no painel focado e possui uma segunda tentativa na aba ativa do WhatsApp.
- A observacao de paginas dinamicas usava verificacao periodica. Foi substituida por eventos de History API, navegacao e `MutationObserver` com debounce.

## Validacao manual obrigatoria

Estes fluxos nao podem ser confirmados de ponta a ponta sem usar as contas reais do usuario:

- Geracao do link `meli.la` pelo menu de afiliados do Mercado Livre.
- Ativacao de cupons em uma sessao autenticada, incluindo o aviso de permissao da Debugger API.
- Publicacao real no site e Telegram.
- Colagem e envio sequencial da imagem para grupos reais do WhatsApp. A escrita no clipboard ja foi validada separadamente.
- Envio em lote com publicacao externa e reconciliacao de produtos ja cadastrados.
- Recuperacao da sessao depois de fechar e reabrir o navegador real.

Uma versao somente deve ser declarada pronta para producao depois que os fluxos acima forem executados na instalacao autenticada do usuario.
