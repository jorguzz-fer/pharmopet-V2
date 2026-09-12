# ADR 0007 — React com Vite no front web, e não Next.js

- Status: aceito
- Data: 2026-09-12

## Contexto

O blueprint pede **React + TypeScript, mobile-first**, com Next.js como
alternativa "se quiser SSR/BFF no front". A ADR 0004 já fixou API-first: o
contrato OpenAPI é a fonte de verdade e o cliente é gerado dele.

O sistema é interno — veterinário autenticado prescrevendo, e o tutor abrindo
um link direto da própria receita. Nada aqui é indexável: a receita de um
animal identificado não deveria aparecer em busca, e as telas internas ficam
atrás de login. SEO, portanto, não é argumento.

## Opções consideradas

1. **Next.js** — traria SSR, rotas de API e um BFF no mesmo processo. Em troca,
   o front passa a ter servidor próprio: outro runtime Node para implantar,
   monitorar e manter, e a fronteira com a API do NestJS fica ambígua — parte da
   regra tenderia a migrar para o BFF, que é exatamente a erosão que a ADR 0004
   quis evitar. O build também ganha uma superfície de erro que já nos mordeu
   fora deste projeto: página estática que consulta o banco durante o
   `docker build`, quando banco nenhum existe.
2. **React + Vite** — SPA de arquivo estático. Um `nginx` serve o `dist`; o
   único servidor do sistema é a API. O build não executa código de aplicação e
   não depende de banco.

## Decisão

React 19 + Vite, empacotado como estático. O NestJS continua sendo o único
servidor, e o front fala com ele pelo cliente gerado do contrato.

Tailwind 4 para o estilo, alimentado pelos tokens: um script traduz
`@pharmopet/design-tokens` para o bloco `@theme`, de modo que `bg-turquesa-700`
exista como utilitário e cor escrita à mão em componente não tenha para onde ir.
O adaptador mora no app, não no pacote de tokens — o pacote é compartilhado com
o que vier depois (nativo, PDF, e-mail) e não deve saber qual framework de CSS a
web escolheu.

## Consequências

- Sem SSR: o primeiro carregamento mostra a moldura antes do dado. Aceitável num
  sistema de uso repetido, em que o custo se paga uma vez por sessão.
- Sem BFF, a sessão em cookie httpOnly precisa que a API e o front compartilhem
  domínio ou que o CORS esteja certo com `credentials`. É o que o `ALLOWED_ORIGINS`
  validado no boot resolve — e é a primeira coisa que a tela de Estado acusa
  quando está errado.
- Se um dia houver página pública que precise de SEO (site, catálogo), ela é um
  projeto à parte. Não é motivo para trazer um servidor de front para cá.
