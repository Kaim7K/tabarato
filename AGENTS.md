# AGENTS.md

## Project Context

Este é o app próprio do Tá Barato. Mantenha as mudanças focadas no pedido do usuário e preserve os padrões atuais do projeto.

## Stack

- `src/`: frontend React/Vite.
- `api/`: Vercel Functions.
- `migrations/`: SQL para PostgreSQL.
- `.env.local`: valores locais; nunca commitar segredos.

## Working Notes

- Use `npm run dev` para desenvolvimento frontend.
- Use `npx vercel dev` quando precisar testar rotas serverless locais.
- Rode os checks relevantes de `package.json` antes de finalizar mudanças.
