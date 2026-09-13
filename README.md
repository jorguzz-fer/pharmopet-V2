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
pnpm --filter @pharmopet/api prisma:migrate
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
no `ALLOWED_ORIGINS` da API — a tela de Estado diz se os dois estão se falando.

## O primeiro usuário

Criar usuário exige ser administrador, e no banco vazio não há nenhum. A saída
não é uma conta padrão no seed — isso é credencial conhecida esperando em
produção — e sim um comando, que exige acesso ao servidor:

```bash
pnpm --filter @pharmopet/api usuario:criar \
  --email voce@clinica.com --nome "Seu Nome" --papel ADMIN
```

A senha não vem por argumento, porque linha de comando vai para o histórico do
shell e aparece na lista de processos. Ou o comando gera uma e mostra **uma vez
só**, ou você a passa em `PHARMOPET_SENHA`.

Papéis: `ADMIN` (administra a instalação), `VETERINARIO` (prescreve, e aí vale
`--crmv`), `FARMACIA` (manipula).

## O catálogo

Sem catálogo não há o que prescrever: a montagem da receita abre sem forma
farmacêutica e sem ativo, e a instalação parece quebrada quando só está vazia.
Insumo não se cadastra um a um pela tela — vem do export da farmácia.

Confira antes de importar. Este comando não toca no banco; só diz, linha a
linha, o que o sistema sabe precificar e o que não sabe:

```bash
pnpm --filter @pharmopet/api catalogo:conferir -- --arquivo insumos.json
```

Depois, importe:

```bash
pnpm --filter @pharmopet/api catalogo:importar -- \
  --formas formas.json \
  --insumos insumos.json \
  --controlados controlados.json \
  --excecoes excecoes.json
```

Cada arquivo é opcional e independente — dá para importar só as formas, ou só
reaplicar os controlados depois de um export novo. É idempotente: rodar de novo
atualiza preço e descrição de quem já existe, sem duplicar.

**Nada entra por suposição.** O que a conferência bloqueia fica de fora aqui
também, e o comando diz quantos foram. Do export real de hoje, 308 de 702
entram — o resto espera decisões de precificação que a farmácia ainda não tomou.

Três coisas que a reimportação **não** sobrescreve, de propósito: `controlado` e
a lista de controle (quem manda neles é `controlados.json` e a tela; um reimport
não deve desmarcar um controlado), o estoque (o export traz número sem unidade)
e o `aceitaAroma` da forma (`formas.json` traz só nomes).

E um aviso que vale ler: se um código passar a apontar para outro produto, o
comando avisa. Restrição de forma e faixa terapêutica ficam penduradas na linha
do insumo, então seguem o código — uma proibição escrita para uma substância
passaria a valer para a que herdou o número. Receita já emitida não corre risco:
ela congela código e descrição na emissão.

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

Os testes de autorização falam com Postgres de verdade — contra dublê, provariam
que o dublê concorda com o código. Suba o banco (`pnpm infra:up`) e aplique as
migrations antes; sem `DATABASE_URL` eles falham dizendo isso, em vez de se
pularem em silêncio.

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
- **Acesso**: rota nasce protegida; abrir uma exige `@Publica()` escrito à mão (ADR 0008)
- **Cor**: sai do pacote de tokens; hex escrito à mão em componente não passa na revisão
- **Números**: dinheiro e grandeza física em inteiro, com a unidade no nome do
  campo — `...EmCentavos`, `...EmMicro`, `...EmMiligramas` (ADR 0009)
- **Resposta**: o recorte por papel é no servidor. Se o dado não pode ser visto,
  ele não entra na resposta — esconder na tela não esconde de ninguém
