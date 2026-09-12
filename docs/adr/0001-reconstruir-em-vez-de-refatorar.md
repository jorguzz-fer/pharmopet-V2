# ADR 0001 — Reconstruir em vez de refatorar

- Status: aceito
- Data: 2026-09-12

## Contexto

A primeira versão da PharmoPet foi escrita no início da experiência da equipe e
acumulou problemas estruturais: controllers duplicados em `.js` e `.ts`, campos
marcados `DEPRECATED` ainda em uso, CORS com origens fixas no código enquanto a
variável `ALLOWED_ORIGINS` era ignorada, autenticação artesanal, seeds rodando a
cada boot do container, nenhum contrato de API e praticamente nenhum teste — um
único `expect(true)`. A ausência de CI derrubou o deploy duas vezes no mesmo dia.

Dois fatos mudam o cálculo de risco de uma reescrita:

1. O sistema **não tem dados reais** — está em pré-produção.
2. O **domínio já foi validado** com o cliente ao longo de vários reviews.

Reescrever software em produção é caro e arriscado. Reescrever um pré-produção
cujo domínio já está entendido é principalmente trabalho de transcrição.

## Opções consideradas

1. **Refatorar incrementalmente** — preserva o histórico e não interrompe o
   cliente, mas carrega as decisões estruturais erradas (auth, ausência de
   contrato, seeds no entrypoint) que são justamente as caras de mudar depois.
2. **Reconstruir seguindo o Engineering Blueprint** — custo inicial maior e
   pausa na evolução funcional, em troca de fundação correta desde o primeiro
   commit.

## Decisão

Reconstruir, aplicando o blueprint. O código nasce novo; o conhecimento de
domínio é o que atravessa — motor de precificação, calculadora de posologia
(conferida contra a planilha de referência), bulário, ranges terapêuticos e
regras de controlados são portados **com teste**, não reescritos por intuição.

## Consequências

- O sistema anterior fica congelado enquanto a v2 não alcança o estado atual.
  O cliente precisa saber disso — é o custo mais visível desta decisão.
- Cada peça de domínio portada ganha teste, o que não existia antes.
- A fase 4 é o marco em que a v2 reencontra o valor já entregue pela v1.
