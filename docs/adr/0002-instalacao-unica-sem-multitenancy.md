# ADR 0002 — Instalação única, sem multitenancy

- Status: aceito
- Data: 2026-09-12

## Contexto

A PharmoPet atende clínicas parceiras que funcionam como revendedoras, e houve
conversa sobre expandir o negócio com franquias. Isso levanta a pergunta de se
cada farmácia/franquia deveria ser um tenant isolado desde o início.

O blueprint trata multitenancy como opcional e recomenda, quando aplicável,
`tenant_id` + RLS no Postgres.

## Opções consideradas

1. **Multitenant desde o início** (`tenant_id` + RLS) — custa pouco agora,
   evita retrofit caro, mas adiciona complexidade a cada query, cada teste e
   cada seed para um cenário que ainda não existe.
2. **Instalação única** — mais simples em toda camada; clínicas seguem sendo
   uma entidade de domínio, não uma fronteira de isolamento.

## Decisão

Instalação única. Uma farmácia, uma instalação. Clínicas permanecem como
cadastro dentro do sistema.

## Consequências

- Todo o código fica mais simples: sem resolução de tenant, sem RLS, sem
  prefixo de tenant em cache, storage, logs e filas.
- **Dívida assumida e conhecida:** se franquias saírem do papel, retrofitar
  multitenancy exige `tenant_id` em toda tabela de domínio, políticas RLS,
  revisão de todas as queries e testes de isolamento. É caro, e a decisão foi
  tomada ciente disso.
- Gatilho para reabrir este ADR: qualquer movimento concreto de franquia ou a
  necessidade de uma segunda farmácia na mesma instalação.
