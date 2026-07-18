# Relatorio de correcoes — 18/07/2026

## Correcoes aplicadas

1. Corrigido o parser de precos do painel e da API para valores com uma ou duas casas decimais.
2. Corrigida a captura automatica do produto logo apos o primeiro login.
3. Melhorada a identificacao e recuperacao do link afiliado `meli.la` do Mercado Livre.
4. O lote agora abre ate cinco produtos em paralelo, mantendo no maximo cinco abas de trabalho.
5. Cada produto so e lido depois que nome, preco e imagem ficam estaveis em tres verificacoes consecutivas.
6. A aba e ativada antes da extracao para permitir o carregamento de componentes dinamicos e do painel de afiliados.
7. Paginas incompletas sao recarregadas e capturadas novamente antes de o produto ser ignorado.
8. Cada aba e fechada imediatamente apos o processamento, e todas sao removidas ao parar ou finalizar o lote.
9. Evitada a tentativa redundante de clipboard offscreen no envio ao WhatsApp.
10. Atualizados testes e documentacao de validacao.

## Resultado

- 81 testes automatizados aprovados.
- Teste de execucao confirmou lotes 5 + 5 + 2, leitura sequencial e limite maximo de cinco abas.
- 42.501 verificacoes deterministicas de carga aprovadas.
- Lint, typecheck e build aprovados.
- `npm audit --omit=dev`: zero vulnerabilidades.

## Seguranca

Os arquivos privados de ambiente, dependencias locais, cache do Chromium e build local nao fazem parte dos pacotes entregues.

## Pendente de conta real

Links afiliados, cupons autenticados, publicacao real, Telegram e grupos de WhatsApp precisam de uma ultima validacao na instalacao autenticada.

## 3.1.3 - Ordem correta da captura de afiliado

- Eliminada a rolagem forçada que centralizava o botao `Compartilhar` selecionado.
- As abas do Mercado Livre sao posicionadas no topo antes da procura do afiliado e novamente apos recargas.
- O seletor de afiliado prioriza o bloco superior e ignora compartilhamentos genericos localizados abaixo.
- O link `meli.la` e capturado antes das rotinas de cupom e pagamento.

## 3.1.4 - Historico antes das abas e cupom confiavel

- Adicionada consulta por `sourceProductId` antes da abertura das abas do lote.
- O banco agora responde quais IDs ja tiveram publicacao confirmada.
- Itens repetidos nao carregam pagina, nao geram link novamente e nao sao reenviados.
- Leitura de cupom reforcada para `Com CODIGO`, preco com cupom, cupom selecionavel e cupom aplicado sem codigo.
- Na ausencia de codigo visivel, o texto padrao passa a ser `disponível no anúncio. Ative antes de comprar.`.

## 3.1.5

- Corrigida a leitura de códigos explícitos dentro do modal de cupons do Mercado Livre.
- O extrator agora reconhece vários rótulos `Com CÓDIGO` mesmo em cartões sem seletores semânticos.
- A espera pela renderização dos cartões do modal foi ampliada para 3,6 segundos.
