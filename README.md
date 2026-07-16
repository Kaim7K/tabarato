# Tá Barato

Aplicação de curadoria de ofertas com vitrine pública, busca, favoritos locais e painel administrativo para cadastro de produtos, categorias, estoque e configurações.

## Rodar Localmente

Instale as dependências:

```bash
npm install
```

Rode o ambiente local completo:

```bash
base44 dev
```

Para trabalhar apenas no frontend contra o backend hospedado:

```bash
npm run dev
```

## Variáveis Locais

Para frontend-only, crie `.env.local` com:

```bash
VITE_BASE44_APP_ID=seu_app_id
VITE_BASE44_APP_BASE_URL=https://seu-app.base44.app
```

## Checks

```bash
npm run lint
npm run build
```
