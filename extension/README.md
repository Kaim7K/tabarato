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
- A extensao pede acesso apenas ao dominio configurado pelo administrador.
- O link capturado deve ser revisado, pois algumas lojas nao disponibilizam automaticamente o link pessoal de afiliado no HTML.
