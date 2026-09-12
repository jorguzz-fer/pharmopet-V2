# ADR 0010 — Receita emitida é imutável, numerada e com prazo gravado

- Status: aceito
- Data: 2026-09-12

## Contexto

A v1 tratava prescrição como formulário: uma linha em `prescricoes` com
`status` e campos que qualquer atualização reescrevia. Não havia número, não
havia validade, e corrigir uma dose era um `UPDATE` que apagava o que fora
prescrito antes — sem deixar rastro de que existiu.

Isso funciona enquanto ninguém pergunta. A pergunta aparece em três situações
concretas, e todas são previsíveis:

1. **A farmácia manipulou algo diferente do que o veterinário pediu.** Sem o
   documento como ele estava na emissão, a conversa vira a palavra de um contra
   a do outro.
2. **Fiscalização de controlado.** A Portaria 344/98 exige que a receita de um
   controlado tenha prazo e possa ser identificada. "A linha do banco" não é
   identificação; número é.
3. **O cadastro muda por baixo.** O catálogo é reimportado a cada export da
   farmácia — descrição corrigida, custo novo, forma renomeada. Uma receita que
   lê o cadastro atual muda de conteúdo sozinha, meses depois de assinada.

## Opções consideradas

1. **Manter a receita editável e versionar por auditoria.** A trilha registra o
   que mudou, e a receita é sempre a última versão. Barato de implementar;
   exige reconstituir o documento a partir do log para responder "o que estava
   escrito no dia 3", que é a única pergunta que importa.
2. **Receita imutável, com estado.** Rascunho é editável e não tem número;
   emitida é congelada e numerada. Correção é cancelar e emitir outra.

## Decisão

Opção 2.

- **Estados**: `RASCUNHO` → `EMITIDA` → `CANCELADA`. Não existe caminho de
  escrita que altere uma receita fora de `RASCUNHO`; a API recusa com uma
  mensagem que diz o que fazer ("cancele e emita uma nova").
- **Cancelamento exige motivo.** Cancelar sem motivo registrado é apagar com
  outro nome.
- **Congelados na emissão**: peso do paciente, CRMV do veterinário, preço de
  cada fórmula, nome da forma, código e descrição de cada insumo, e a lista de
  controle que determinou o prazo. Nome de tutor e de paciente seguem por
  relação — mudança ali é correção de cadastro, não reescrita do que foi
  prescrito.
- **Número vem de uma sequence do Postgres**, não de `max(numero) + 1` nem de
  `autoincrement()`. `max + 1` dá o mesmo número a duas emissões simultâneas;
  `autoincrement()` numeraria o rascunho, e rascunho numerado que nunca virou
  receita é um buraco na numeração que alguém vai precisar explicar.
- **Prazo gravado, não recalculado.** `validaAte`, `prazoEmDias` e o motivo
  ficam na linha. A regra pode mudar; a receita de ontem continua valendo pelo
  que valia ontem.

Os prazos em si moram em código (`packages/shared/src/receita.ts`), não em
cadastro: 30 dias para A1–A3, B1, B2, C1, C2 e C5; 10 dias para antimicrobiano;
180 dias para receita comum. Os primeiros são a leitura da Portaria 344/98 e da
RDC 471/2021 — mudança neles precisa passar por revisão e ficar no histórico do
repositório, e não ser um campo que alguém edita numa tela. O último não é
norma, é política de operação, e está marcado como tal no código.

Vale o prazo **mais curto** entre os itens: a folha é uma só, e uma receita com
antimicrobiano e controlado vence em dez dias.

Lista de controle desconhecida **não cai no prazo padrão** — a emissão para e
pede cadastro. Dar seis meses a um entorpecente porque a sigla não estava na
tabela seria o erro mais caro que este módulo consegue cometer.

## Consequências

- Corrigir uma dose custa duas operações e queima um número. É o preço de o
  documento ser documento, e é o comportamento de qualquer receituário em papel.
- A receita emitida não mostra avisos de dose. Aviso é ajuda de quem está
  prescrevendo; recalculá-lo meses depois contra outro catálogo diria coisas que
  o veterinário nunca viu na hora de assinar.
- Emitir exige CRMV no cadastro de quem assina e peso registrado no paciente.
  Sem peso não há contra o que conferir a dose, e uma receita magistral sem
  conferência de dose é justamente o que este sistema existe para evitar.
- A numeração é global da instalação, não por veterinário nem por ano. Se a
  farmácia precisar de numeração por exercício, isso vira uma segunda sequence,
  e não uma mudança no modelo.
- Os prazos precisam de confirmação da farmácia antes de ir a produção,
  especialmente os 180 dias da receita comum, que são escolha nossa.
