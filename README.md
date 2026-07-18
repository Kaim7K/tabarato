# Tá Barato

Aplicação própria de curadoria de ofertas com vitrine pública, favoritos locais, painel administrativo, PostgreSQL e publicação/agendamento no Telegram.

## Stack

- React 18 + Vite
- Tailwind CSS
- Vercel Functions em `api/`
- PostgreSQL para ofertas, cliques e agendamentos
- Telegram Bot API para publicação no canal

## Rodar Localmente

```bash
npm install
npm run dev
```

Para testar as funções serverless localmente, prefira:

```bash
npx vercel dev
```

## Variáveis de Ambiente

Copie `.env.example` para `.env.local` e configure:

```bash
POSTGRES_URL=
DATABASE_URL=
ADMIN_API_KEY=
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHANNEL_ID=
CRON_SECRET=
APP_URL=
VITE_WHATSAPP_GROUP_URL=
VITE_TELEGRAM_CHANNEL_URL=
EXTENSION_ORIGIN=
```

Use `POSTGRES_URL` ou `DATABASE_URL`. Não coloque tokens reais no repositório.

Para o painel administrativo, configure `ADMIN_USERNAME` e `ADMIN_PASSWORD`. Se preferir não manter senha em texto claro no ambiente, use `ADMIN_PASSWORD_SHA256` com `ADMIN_PASSWORD_SALT`.

## Banco de Dados

Execute a migration:

```sql
migrations/001_create_telegram_offers.sql
```

Ela cria as tabelas `telegram_offers` e `telegram_auto_messages`, além dos índices e gatilhos de atualização necessários.

## Telegram

1. Abra o Telegram e converse com `@BotFather`.
2. Use `/newbot`, escolha nome e username.
3. Copie o token gerado para `TELEGRAM_BOT_TOKEN`.
4. Adicione o bot como administrador do canal.
5. Dê permissão para publicar mensagens.
6. Configure `TELEGRAM_CHANNEL_ID` com o ID do canal, por exemplo `@seucanal` ou o ID numérico.

No painel `/admin/ofertas`, entre com `ADMIN_USERNAME` e `ADMIN_PASSWORD`. Depois use **Testar conexão com Telegram**. O teste envia:

```text
✅ Bot do Tá Barato conectado com sucesso!
```

## Publicação

O servidor usa:

- `sendPhoto` quando `imageUrl` é HTTPS.
- `sendMessage` quando não houver imagem.
- Botão inline `🛒 Ver oferta` apontando diretamente para o link de afiliado.

O token do bot nunca é enviado ao navegador.

## Agendamento

A rota de cron é:

```text
/api/cron/publicar-agendadas
```

O `vercel.json` agenda uma execução diária às 12:00 UTC, compatível com o plano Hobby. A rota valida `CRON_SECRET` pelo header `Authorization: Bearer <CRON_SECRET>` ou pelo header `x-cron-secret`. Para intervalos menores nas mensagens recorrentes, configure um agendador compatível com a frequência desejada.

## Painel

Acesse:

```text
/admin/ofertas
```

Funcionalidades:

- listar, pesquisar e filtrar;
- criar, editar e excluir;
- salvar rascunho;
- publicar agora;
- agendar;
- reenviar ofertas com erro;
- ver prévia do card e da mensagem Telegram;
- ver status, agendamento, publicação, ID da mensagem e erro.

## Vercel

Configure manualmente no projeto:

- `POSTGRES_URL` ou `DATABASE_URL`
- `ADMIN_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`
- `CRON_SECRET`
- `APP_URL`
- `VITE_WHATSAPP_GROUP_URL`
- `VITE_TELEGRAM_CHANNEL_URL`

Depois rode novo deploy. Não há deploy automático neste repositório.

## Diagnóstico

- 401 no painel: confira `ADMIN_API_KEY`, `ADMIN_USERNAME` e `ADMIN_PASSWORD`.
- 500 de banco: confira `POSTGRES_URL` ou `DATABASE_URL` e se a migration foi executada.
- Erro no Telegram: confira token, canal e se o bot é administrador.
- Oferta não publica: confira status, campos obrigatórios e se já existe `telegram_message_id`.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Extensao em varios navegadores

O diretorio `extension/` contem manifests separados para Chromium, Firefox e Safari. Para a Vercel aceitar requisicoes das versoes instaladas, configure por exemplo:

```text
EXTENSION_ORIGIN=chrome-extension://ID_DO_CHROMIUM,moz-extension://*,safari-web-extension://*
```

O token temporario da extensao continua obrigatorio em todas as rotas administrativas. A ativacao automatica de cupons e exclusiva da versao Chromium por depender da Debugger API; os demais fluxos possuem fallback multiplataforma.
