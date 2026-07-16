# Revisão de produção - Tá Barato

## Fluxos manuais principais

- Home pública: abrir `/`, conferir hero de Telegram/WhatsApp, oferta destaque, ofertas recentes, categorias e mais clicados.
- Busca: pesquisar por nome e categoria, abrir sugestão, usar página `/buscar?q=...`, aplicar filtros de preço/plataforma.
- Oferta: abrir `/oferta/:id`, conferir imagem, preço, descrição, link de afiliado, favorito e compartilhamento.
- Favoritos: salvar/remover oferta e conferir persistência local.
- Admin: abrir `/admin/login`, autenticar, listar ofertas, criar rascunho, editar, agendar, publicar e excluir.
- Telegram: testar conexão, publicar oferta e verificar resposta/erro no painel.
- Mensagens recorrentes: criar, editar, enviar agora, ativar/desativar e excluir.
- Mobile: conferir menu, busca, cards, CTAs da hero, tabelas/listas admin e botões de ação em telas pequenas.

## Checklist final

- Build de produção executa sem erro.
- Lint e typecheck passam.
- Testes automatizados passam.
- `npm audit --omit=dev` retorna zero vulnerabilidades.
- `.env.local` não deve ser commitado.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` ou `ADMIN_PASSWORD_SHA256`, `ADMIN_API_KEY`, banco, Telegram e cron precisam estar configurados no ambiente de produção.
- Nenhuma tabela ou migration destrutiva foi adicionada nesta revisão.
- Links públicos `VITE_WHATSAPP_GROUP_URL` e `VITE_TELEGRAM_CHANNEL_URL` devem estar preenchidos para exibir todos os botões.
