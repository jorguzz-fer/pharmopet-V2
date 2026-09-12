# ADR 0003 — Prisma em vez de Drizzle

- Status: aceito
- Data: 2026-09-12

## Contexto

O blueprint aceita Drizzle (schema em TS, SQL previsível) ou Prisma (DX), e
sugere Drizzle quando se quer controle fino de SQL — especialmente relevante em
cenários com RLS.

Como o ADR 0002 descartou multitenancy, o principal argumento técnico a favor
de Drizzle neste projeto perde peso. A equipe já opera Prisma no sistema
anterior, incluindo schema, migrations e seeds.

## Opções consideradas

1. **Drizzle** — SQL mais previsível e controle fino; custo de aprendizado e de
   reescrever o que já se sabe modelar.
2. **Prisma** — continuidade de ferramenta e de modelagem; o domínio das 28
   entidades porta quase diretamente.

## Decisão

Prisma. A continuidade reduz o risco da reconstrução: a energia vai para a
arquitetura e os testes, não para reaprender a camada de dados.

## Consequências

- Migrations versionadas seguem o fluxo já conhecido (`migrate deploy`).
- **Correção em relação à v1:** seeds deixam de rodar no entrypoint do
  container a cada boot. Popular banco não é migration.
- Se uma query do motor de precificação exigir SQL que o Prisma expresse mal,
  a saída é `$queryRaw` pontual, não trocar de ORM.
