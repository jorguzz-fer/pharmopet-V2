# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# API da PharmoPet.
#
# O contexto de build é a RAIZ do monorepo, e não apps/api. A API importa
# @pharmopet/shared pelo dist do pacote; sem o pnpm-workspace.yaml, o lockfile
# e packages/ no contexto, o build não resolve esse import.
#
#   docker build -f apps/api/Dockerfile -t pharmopet-api .
#
# No Coolify: "Base Directory" = /, "Dockerfile Location" = apps/api/Dockerfile.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS base

# openssl não vem na imagem slim, e o engine do Prisma linka contra ele. Sem
# isto a API sobe e só quebra na primeira query — falha tardia e com mensagem
# que não aponta para a causa.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# O corepack pergunta antes de baixar o pnpm, e num build não-interativo essa
# pergunta não tem quem responda: o build trava até estourar o tempo.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# A versão do pnpm sai do campo packageManager da raiz — a mesma do CI.
RUN corepack enable

# Desliga a checagem de versão que a CLI do Prisma faz na largada. São milissegundos,
# mas são milissegundos de ida à internet no caminho do boot, e um boot que
# depende de servidor de terceiro estar de pé é frágil sem precisar ser.
ENV CHECKPOINT_DISABLE=1

WORKDIR /app

# --- dependências -----------------------------------------------------------
FROM base AS deps

# Só os manifestos, antes do código: enquanto nenhum package.json mudar, esta
# camada fica em cache e o install não roda de novo a cada commit.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/

RUN pnpm install --frozen-lockfile

# --- build ------------------------------------------------------------------
FROM deps AS build

COPY . .

# A mesma ordem do CI, e pelos mesmos motivos: o cliente do Prisma precisa
# existir antes de qualquer typecheck, e os pacotes precisam de dist antes de a
# API compilar contra eles.
RUN pnpm --filter @pharmopet/api prisma:generate \
  && pnpm build:pacotes \
  && pnpm --filter @pharmopet/api build

# --- runtime ----------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production

# node_modules vem inteiro do estágio de build, com devDependencies.
#
# É deliberado, e o motivo é o `prisma migrate deploy` do entrypoint: a CLI do
# Prisma é devDependency, e uma imagem só com dependências de produção não
# consegue aplicar migration nenhuma. O custo é uma imagem maior; a alternativa
# seria instalar a CLI à parte e manter a versão dela em sincronia com a do
# @prisma/client na mão, que é o tipo de sincronia que ninguém lembra de fazer.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./

# Só o shared: é o único pacote do workspace que a API importa. design-tokens e
# api-client são do front, e carregá-los aqui seria peso morto numa imagem que
# já não é pequena.
#
# O symlink apps/api/node_modules/@pharmopet/shared aponta para esta pasta, por
# caminho relativo — daí o layout precisar ser idêntico ao do build.
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/node_modules packages/shared/node_modules

COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
# O schema e as migrations viajam junto: é deles que o `migrate deploy` vive.
COPY --from=build /app/apps/api/prisma apps/api/prisma

COPY apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

# Sem root: um processo que não precisa escrever em lugar nenhum não deveria
# poder. A imagem node já traz o usuário `node`.
USER node

EXPOSE 3000

# O mesmo endpoint que o Coolify deve apontar. `--fail` para status >= 400 virar
# saída diferente de zero, senão o healthcheck passaria com a API respondendo 500.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint"]
