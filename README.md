# PharmoPet

Plataforma de prescrição e manipulação veterinária: o veterinário monta a
receita — incluindo formulação magistral com preço em tempo real — o tutor
recebe e paga, e o pedido segue para a manipulação.

Reconstrução da v1 seguindo o [Engineering Blueprint](docs/ENGINEERING_BLUEPRINT.md).
As decisões estruturais estão em [`docs/adr/`](docs/adr/).

## Começando

Requer Node 22 (`.nvmrc`) e pnpm 10.

```bash
pnpm install
pnpm infra:up                      # Postgres local
cp apps/api/.env.example apps/api/.env
pnpm --filter @pharmopet/api prisma:generate
pnpm --filter @pharmopet/api dev
```

A API sobe em `http://localhost:3000/api/v1`. O contrato fica em
`/api/docs` (navegável) e `/api/openapi.json` (fonte de verdade).

## Verificação

```bash
pnpm verify    # lint + typecheck + test + build
```

O mesmo gate roda na CI e bloqueia merge. Rode antes de abrir PR.

## Estrutura

```
apps/api          API NestJS · REST + OpenAPI 3.1
packages/shared   schemas Zod e lógica de domínio compartilhada
infra             compose local
docs/adr          decisões arquiteturais
```

## Convenções

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…)
- **Branches**: curtas, a partir de `main`; `main` sempre deployável
- **Schemas**: Zod é a única linguagem de schema — validação e OpenAPI saem dele (ADR 0006)
- **Segredos**: só por ambiente; nada de valor sensível como padrão no código
