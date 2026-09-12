# ADR 0005 — NestJS como framework da API

- Status: aceito
- Data: 2026-09-12

## Contexto

O blueprint recomenda NestJS (DI, guards/interceptors, modular) com Fastify puro
como alternativa mais enxuta. A arquitetura escolhida é monólito modular com
fronteiras por domínio.

## Opções consideradas

1. **Fastify puro** — mais leve e mais rápido, mas a estrutura modular, a
   injeção de dependências e os guards de autorização ficam por conta da equipe.
2. **NestJS** — módulos, DI e guards são do framework; alinhado à separação em
   bounded contexts e ao RBAC server-side.

## Decisão

NestJS. Os módulos do framework mapeiam diretamente os domínios, e guards e
interceptors dão um lugar natural para autorização e auditoria — justamente o
que era artesanal e espalhado na v1.

## Consequências

- Mais dependências e um custo de arranque maior que Fastify puro.
- Decorators exigem `emitDecoratorMetadata`, o que restringe o executor de
  testes: o `esbuild` do Vitest não suporta esse metadado, então a API usa
  **Jest + ts-jest**. Pacotes de lógica pura, como `@pharmopet/shared`, usam
  Vitest.
