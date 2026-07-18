# Relatorio de correcoes — 18/07/2026

## Correcoes aplicadas

1. Corrigido o parser de precos do painel e da API para valores com uma ou duas casas decimais.
2. Corrigida a captura automatica do produto logo apos o primeiro login.
3. Melhorada a identificacao do botao de afiliado do Mercado Livre por texto, `aria-label` e `title`.
4. Evitada a tentativa redundante de clipboard offscreen no envio ao WhatsApp.
5. Corrigido o erro de lint no extrator do Mercado Livre.
6. Atualizados testes e documentacao de validacao.

## Resultado

- 80 testes automatizados aprovados.
- 42.501 verificacoes deterministicas de carga aprovadas.
- Lint, typecheck e build aprovados.
- `npm audit --omit=dev`: zero vulnerabilidades.
- Fluxo completo do painel aprovado em Chromium controlado, sem erros de console.

## Seguranca

O ZIP recebido continha arquivos `.env.local` e `.env.production.local` com credenciais preenchidas. Eles foram removidos dos pacotes entregues. Por seguranca, troque as senhas, tokens, chaves de API, segredo do cron e credenciais do banco que estavam nesses arquivos.

## Pendente de conta real

Links afiliados, cupons autenticados, publicacao real, Telegram e grupos de WhatsApp precisam de uma ultima validacao na sua instalacao autenticada.
