# ADR 0011 — A clientela é visível só para quem cadastrou

- Status: aceito
- Data: 2026-09-12

## Contexto

A ADR 0002 fixou instalação única, sem multitenancy: uma farmácia, um banco,
vários veterinários. A consequência que só aparece quando se modela tutor e
paciente é que **a lista de tutores de um veterinário é a carteira de clientes
do outro** — e todos estão na mesma tabela.

São dois problemas distintos no mesmo dado:

1. **Comercial.** Quem prescreve numa clínica não deveria conseguir listar os
   tutores que outro veterinário atende, com telefone e endereço.
2. **Dado pessoal de terceiro.** CPF, telefone e endereço do tutor são dados
   pessoais sob a LGPD, e o tutor os forneceu ao veterinário que o atende — não
   a todos os veterinários cadastrados na farmácia.

A v1 não tinha o problema porque não tinha veterinário nenhum com acesso à base:
tudo passava pelo admin.

## Opções consideradas

1. **Todos veem tudo.** É o mais simples, e é o que sai de graça de um
   `findMany` sem `where`. Adiável até o dia em que dois veterinários que não se
   conhecem usam a mesma instalação — que é o dia em que a farmácia quer vender
   o sistema para a segunda clínica.
2. **Cadastro de clínica, com vínculo.** Resolve de verdade, e é trabalho de uma
   fase inteira: entidade clínica, vínculo veterinário-clínica, escopo por
   clínica, e a decisão de o que acontece quando um veterinário atende em duas.
3. **Escopo por autor.** Quem cadastrou a ficha vê a ficha. ADMIN e FARMACIA
   veem tudo.

## Decisão

Opção 3, com o escopo num módulo só (`apps/api/src/receituario/escopo.ts`) e
aplicado tanto na leitura quanto na escrita.

- **VETERINARIO** vê os tutores que cadastrou, os pacientes desses tutores e as
  receitas que emitiu.
- **ADMIN** e **FARMACIA** veem tudo, porque precisam: uma manipula e entrega, a
  outra administra.
- O que está fora do escopo responde **404, nunca 403**. "Existe, mas não é seu"
  já confirma que aquele id existe — e para quem está sondando uma carteira de
  clientes, confirmação é o que ele quer.
- A regra vale também para escrita: informar o id de um tutor alheio ao criar um
  paciente falha do mesmo jeito que lê-lo.

## Consequências

- Dois veterinários da mesma clínica que atendem o mesmo tutor terão duas
  fichas. É o incômodo que esta decisão cobra, e é menor do que o vazamento que
  ela evita. O CPF único impede a duplicata quando o documento foi informado —
  o segundo cadastro recebe 409, e aí a conversa é entre pessoas.
- Quando existir cadastro de clínica (opção 2), o escopo passa a olhar o vínculo
  em vez do autor. A troca é num arquivo só, e é por isso que ele existe.
- A regra é testada com dois veterinários de verdade na suíte de integração,
  incluindo a tentativa de pendurar um paciente na ficha alheia. Remover o
  escopo derruba três testes.
