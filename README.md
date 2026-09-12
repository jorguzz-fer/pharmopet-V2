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
pnpm build:pacotes                 # os apps consomem os pacotes pelo dist
pnpm infra:up                      # Postgres local
cp apps/api/.env.example apps/api/.env
pnpm --filter @pharmopet/api prisma:generate
pnpm --filter @pharmopet/api dev
```

A API sobe em `http://localhost:3000/api/v1`. O contrato fica em
`/api/docs` (navegável) e `/api/openapi.json` (fonte de verdade).

E o front, em outro terminal:

```bash
cp apps/web/.env.example apps/web/.env
pnpm --filter @pharmopet/web dev
```

Abre em `http://localhost:5173`. A porta é fixa porque é ela que precisa estar
no `ALLOWED_ORIGINS` da API — a tela inicial diz se os dois estão se falando.

## Contrato

O cliente do front nunca é escrito à mão: sai do OpenAPI que a API publica.

```bash
pnpm contrato    # regera apps/api/openapi.json e os tipos do api-client
```

Os dois arquivos são versionados, e a CI regera e exige diferença zero. Mudou um
endpoint? Rode isso e comite o resultado junto.

## Verificação

```bash
pnpm verify    # pacotes + lint + typecheck + test + build
```

O mesmo gate roda na CI e bloqueia merge. Rode antes de abrir PR.

## Estrutura

```
apps/api                 API NestJS · REST + OpenAPI 3.1
apps/web                 front React + Vite, estático
packages/shared          schemas Zod e lógica de domínio compartilhada
packages/design-tokens   cor, tipografia e espaço, com contraste testado
packages/api-client      cliente tipado, gerado do contrato
infra                    compose local
docs/adr                 decisões arquiteturais
```

## Convenções

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…)
- **Branches**: curtas, a partir de `main`; `main` sempre deployável
- **Schemas**: Zod é a única linguagem de schema — validação e OpenAPI saem dele (ADR 0006)
- **Segredos**: só por ambiente; nada de valor sensível como padrão no código
