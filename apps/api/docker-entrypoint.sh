#!/bin/sh
set -e

cd /app/apps/api

# Migrations antes de aceitar requisição.
#
# `migrate deploy` só aplica o que falta e não gera nada — é o comando feito
# para produção, ao contrário de `migrate dev`. Rodar a cada boot é seguro
# porque a operação é idempotente, e evita o passo manual esquecido que deixa a
# API no ar contra um banco sem as tabelas novas.
#
# Chamando o binário direto, e não via `pnpm --filter`: o pnpm chega por
# corepack, que baixa a versão certa na primeira invocação. Num container de
# produção isso viraria uma ida à rede no boot — e um boot que depende do
# registry do npm estar de pé é um boot frágil sem necessidade.
echo "→ aplicando migrations"
./node_modules/.bin/prisma migrate deploy

echo "→ subindo a API"
cd /app
# exec para o node virar o PID 1: sem isto o shell fica no meio do caminho, o
# SIGTERM do Docker não chega à aplicação, e ela morre no timeout em vez de
# encerrar as conexões com calma.
exec node apps/api/dist/main.js
