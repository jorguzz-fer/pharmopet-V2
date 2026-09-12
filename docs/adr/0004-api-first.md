# ADR 0004 — API-first, com OpenAPI como fonte de verdade

- Status: aceito
- Data: 2026-09-12

## Contexto

Nas reuniões com o cliente apareceram dois consumidores além do front web: um
e-commerce futuro e a integração com o Prisma Five, o sistema operacional da
farmácia. Na v1 não havia contrato — front e back eram combinados verbalmente,
o que produziu divergências silenciosas.

## Opções consideradas

1. **API só para o próprio front** — mais simples agora, mas transforma cada
   integração futura em adaptação retroativa.
2. **API-first** (seção 8 do blueprint) — contrato versionado desde o primeiro
   endpoint, cliente gerado, acesso M2M previsto.

## Decisão

API-first. OpenAPI 3.1 é a fonte de verdade; o cliente TypeScript é **gerado**
a partir dele, nunca escrito à mão. A API é versionada desde o primeiro
endpoint (`/api/v1`).

## Consequências

- O contrato é publicado em `/api/openapi.json` e serve de base para gerar
  `@pharmopet/api-client`.
- Toda rota de negócio exige credencial — não existe endpoint anônimo.
- O plano de acesso para terceiros (OAuth2 client credentials, escopos,
  webhooks assinados) entra como fase própria, mas o contrato já nasce pronto
  para ele.
- Custo: disciplina de manter o contrato correto a cada mudança, em troca de
  não pagar adaptação retroativa depois.
