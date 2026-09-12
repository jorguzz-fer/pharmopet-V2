# Deploy no Coolify

Três resources: um banco e duas aplicações. Nenhuma delas compartilha
container, e o banco não fica exposto na internet.

| #   | Resource        | Tipo                     | Porta   |
| --- | --------------- | ------------------------ | ------- |
| 1   | `pharmopet-db`  | PostgreSQL 16            | interna |
| 2   | `pharmopet-api` | Application (Dockerfile) | `3000`  |
| 3   | `pharmopet-web` | Application (Dockerfile) | `80`    |

---

## 1. Banco

**PostgreSQL 16** — a mesma major do desenvolvimento e do CI. Paridade de
versão não é preciosismo: o schema usa `Timestamptz(3)`, `@db.Uuid`,
`@db.Char(2)` e uma sequence criada em SQL na migration, e divergir de major
é a forma mais barata de descobrir uma incompatibilidade em produção.

Nenhuma extensão é necessária. Os UUIDs são gerados pela aplicação, e a
numeração da receita sai de uma sequence comum.

Copie a **URL interna** que o Coolify gera. A pública não deve ser usada: a API
fala com o banco pela rede interna do Docker, e abrir o Postgres para fora
seria superfície sem contrapartida.

---

## 2. API — `pharmopet-api`

### Build

| campo               | valor                 |
| ------------------- | --------------------- |
| Build Pack          | Dockerfile            |
| Base Directory      | `/`                   |
| Dockerfile Location | `apps/api/Dockerfile` |
| Port                | `3000`                |
| Health Check Path   | `/api/v1/health`      |

O **Base Directory precisa ser a raiz**, e não `apps/api`. A API importa
`@pharmopet/shared` pelo dist do pacote; sem o `pnpm-workspace.yaml`, o
lockfile e `packages/` dentro do contexto, o build não resolve esse import.

### Variáveis

```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://usuario:senha@nome-interno:5432/pharmopet
ALLOWED_ORIGINS=https://app.seudominio.com.br
SESSAO_DURACAO_HORAS=12
COOKIE_SEGURO=true
```

Todas de runtime. Três delas o boot valida e, se estiverem erradas, **o
processo recusa subir** — de propósito:

- `ALLOWED_ORIGINS` vazio com `NODE_ENV=production`: sem origem liberada,
  nenhum navegador conversa com a API.
- `COOKIE_SEGURO=false` com `NODE_ENV=production`: o cookie de sessão iria em
  texto claro na primeira requisição HTTP.
- `DATABASE_URL` que não seja URL válida. Senha com `@`, `#`, `?` ou `/`
  precisa vir percent-encoded.

Não existe segredo de token aqui: a sessão é em tabela (ADR 0008), então não
há `JWT_SECRET` para vazar ou rotacionar.

### Migrations

O entrypoint roda `prisma migrate deploy` antes de subir a aplicação, a cada
boot. É idempotente, e evita o passo manual esquecido que deixa a API no ar
contra um banco sem as tabelas novas.

Se um dia houver mais de uma réplica, mova essa linha de
`apps/api/docker-entrypoint.sh` para um passo de pré-deploy.

---

## 3. Web — `pharmopet-web`

### Build

| campo               | valor                 |
| ------------------- | --------------------- |
| Build Pack          | Dockerfile            |
| Base Directory      | `/`                   |
| Dockerfile Location | `apps/web/Dockerfile` |
| Port                | `80`                  |

### Variável

```
VITE_API_URL=https://api.seudominio.com.br
```

**Marque como variável de _build_, não de runtime.** Tudo que começa com
`VITE_` é embutido no bundle durante o build; definida em runtime, ela
simplesmente não existe para a aplicação.

O Dockerfile do web falha explicitamente quando ela não chega, porque o modo de
falhar sem a barreira é péssimo: a imagem sobe, a tela aparece normalmente, e
só o login quebra — apontando para lugar nenhum.

---

## 4. A armadilha de domínio

O cookie de sessão é `SameSite=Lax`. Isso significa que o navegador só o envia
quando a API e o front estão no **mesmo domínio registrável**:

| front                   | API                     | login            |
| ----------------------- | ----------------------- | ---------------- |
| `app.seudominio.com.br` | `api.seudominio.com.br` | funciona         |
| `seudominio.com.br`     | `api.seudominio.com.br` | funciona         |
| `seudominio.com.br`     | `algo.coolify.app`      | **não funciona** |

Subir com os domínios gerados pelo Coolify para "testar antes" leva a um login
que falha sem erro aparente, e isso não é bug do sistema.

`SameSite=None` resolveria em qualquer domínio e não é o caminho: abriria mão
da defesa que o `Lax` dá de graça contra CSRF, num sistema que emite receita.

---

## 5. Depois do primeiro deploy

O sistema não tem cadastro aberto — o primeiro usuário é criado por comando.
No terminal do container da API:

```sh
cd /app/apps/api

PHARMOPET_SENHA='uma senha com 12 caracteres ou mais' \
  node dist/identidade/criar-usuario.cli.js \
  --email voce@seudominio.com.br --nome "Seu Nome" --papel ADMIN
```

Chamando o `node` direto, e não `pnpm usuario:criar`: o script do package.json
começa com `nest build`, que é para a máquina de quem desenvolve. Dentro do
container o código já está compilado, e recompilar em produção seria trabalho
inútil sobre uma imagem que nem deveria ter compilador em uso.

Sem `PHARMOPET_SENHA`, o comando gera uma senha aleatória e a imprime uma única
vez. Papéis: `ADMIN`, `VETERINARIO`, `FARMACIA`. Veterinário aceita `--crmv`.

Depois disso, entrando como ADMIN, dá para cadastrar os demais pela aplicação.

---

## 6. Conferência rápida

```sh
# A API responde e está conectada ao banco
curl https://api.seudominio.com.br/api/v1/health

# O contrato está publicado
curl https://api.seudominio.com.br/api/openapi.json | head

# O front carrega
curl -I https://app.seudominio.com.br
```

Se o `health` responder e o login não funcionar, olhe nesta ordem:
`ALLOWED_ORIGINS`, depois a `VITE_API_URL` que foi embutida no bundle, depois o
domínio (seção 4).
