# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Front web da PharmoPet.
#
# Contexto de build: a RAIZ do monorepo. O front consome três pacotes do
# workspace pelo dist (design-tokens, shared, api-client), e o gerador de tema
# lê os tokens do dist de design-tokens antes de o Vite rodar.
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.seudominio.com.br \
#     -t pharmopet-web .
#
# No Coolify: "Base Directory" = /, "Dockerfile Location" = apps/web/Dockerfile,
# e VITE_API_URL marcada como variável de BUILD.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Sem isto o corepack pergunta antes de baixar o pnpm, e o build não-interativo
# fica esperando uma resposta que nunca vem.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/

RUN pnpm install --frozen-lockfile

COPY . .

# A URL da API entra no bundle na hora do build — não é lida em runtime.
#
# Quem define VITE_* como variável de runtime no painel não vê erro nenhum: a
# imagem sobe, a tela aparece, e só o login falha, apontando para lugar nenhum.
# Por isso a barreira explícita: sem a variável, o build para aqui, com uma
# mensagem que diz o que fazer.
ARG VITE_API_URL
RUN test -n "$VITE_API_URL" || { \
      echo ""; \
      echo "ERRO: VITE_API_URL não foi informada."; \
      echo "Ela precisa ser variável de BUILD, não de runtime — o Vite a embute no bundle."; \
      echo "Ex.: --build-arg VITE_API_URL=https://api.seudominio.com.br"; \
      echo ""; \
      exit 1; \
    }
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm build:pacotes && pnpm --filter @pharmopet/web build

# --- runtime ----------------------------------------------------------------
FROM nginx:1.27-alpine AS runner

# Só os arquivos estáticos. Node não vai para produção aqui: o front é HTML,
# CSS e JS prontos, e um runtime a mais seria superfície de ataque sem uso.
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
