# ADR 0006 — Zod como única linguagem de schema

- Status: aceito
- Data: 2026-09-12

## Contexto

Descoberto ao subir a API pela primeira vez: o `ValidationPipe` padrão do
NestJS exige `class-validator` em runtime. Adotá-lo criaria **duas** linguagens
de schema no projeto, já que o blueprint define Zod para os schemas
compartilhados em `packages/shared`.

Duas linguagens significam a mesma regra escrita duas vezes — e divergindo.

## Opções consideradas

1. **class-validator nos DTOs, Zod no shared** — caminho padrão do Nest, mas
   duplica a definição de cada regra de validação.
2. **Zod em tudo, via `nestjs-zod`** — um só schema serve à validação de
   request e à geração do OpenAPI.

## Decisão

Zod como única linguagem de schema. `nestjs-zod` fornece o `ZodValidationPipe`
global e o `cleanupOpenApiDoc`, de modo que schemas Zod geram o contrato
OpenAPI. DTOs nascem de `createZodDto`.

## Consequências

- Regras de domínio podem morar em `@pharmopet/shared` e ser usadas tanto pela
  API quanto pelos clientes, sem reescrita.
- Dependência de `nestjs-zod` acompanhar as versões de Nest e Swagger — hoje
  compatível com Nest 11, Swagger 11 e Zod 4.
- Validação de ambiente usa o mesmo Zod, e o processo recusa subir com
  configuração inválida.
