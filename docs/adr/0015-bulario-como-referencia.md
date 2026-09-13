# ADR 0015 — O bulário é referência de consulta, não preenchimento de receita

- Status: aceito
- Data: 2026-09-13
- Depende de: [ADR 0009](0009-dinheiro-em-inteiro.md)

## Contexto

A farmácia mantém dezenove guias magistrais em `.docx` — Dermatológica,
Cardiovascular, Otológica, Nutracêutica e mais quinze linhas terapêuticas. São
o material com que o veterinário decide o que prescrever, e hoje circulam por
e-mail e WhatsApp.

A extração desses guias deu **315 formulações**, das quais 201 trazem
composição. Elas entraram no repositório no PR #15, junto com o script que as
extraiu, para a extração ser refazível e conferível contra os originais.

A pergunta desta fase é o que fazer com elas. Duas leituras eram possíveis:

1. **Catálogo de receita pronta**: o veterinário escolhe "Otológica 4.2" e o
   sistema monta a formulação com os ativos e as doses.
2. **Referência de consulta**: o veterinário busca por doença, ativo ou nome,
   lê a formulação, e prescreve com o que já existe na montagem da receita.

## Decisão

**Referência de consulta.** O bulário entra como busca e leitura sobre as 315
formulações. Preencher uma receita a partir de uma entrada fica fora de escopo.

### Por quê: o dado não sustenta o preenchimento

Não é escolha de produto — é o que a medição mostrou. Das 201 formulações com
composição:

| como o ativo é dosado                    | quantas |
| ---------------------------------------- | ------- |
| ao menos um ativo em **percentual**      | 105     |
| ao menos um em **mg/kg**                 | 62      |
| ao menos um em **dose fixa** (mg, g, UI) | 42      |
| nenhum número em ativo nenhum            | 2       |

As categorias se sobrepõem — uma formulação pode ter um ativo em percentual e
outro em mg/kg —, então elas não somam 201.

**105 são dosadas só em percentual**, e se concentram em Dermatológica (74) e
Otológica (24) — xampus, sprays, soluções otológicas. São tópicos, onde
percentual é a forma correta de expressar concentração.

O motor de preço da fase 3 só sabe dose fixa por unidade manipulada. É a mesma
limitação que faz `catalogo:conferir` bloquear 340 das 702 linhas do catálogo
por `tipo-de-calculo-nao-suportado`. Preencher uma receita a partir de uma
formulação percentual exigiria uma segunda conta que ninguém escreveu — e
escrevê-la por conta própria significaria **inventar a regra de precificação da
farmácia**, que é a decisão comercial deles, não nossa.

A pergunta está com o cliente desde o PR #5. Enquanto ela não voltar, o
sistema não deve fingir que sabe.

### O que a referência entrega, e vale para as 315

Buscar por doença, ativo ou nome; filtrar por linha terapêutica e por espécie;
ler a formulação inteira — composição, modo de usar, indicação, diferencial e
observações. Isso serve às 315, inclusive às 105, e não depende de resposta
nenhuma.

### O bulário não é o catálogo

São duas coisas diferentes, e confundi-las seria caro:

- o **catálogo** é o que a farmácia manipula e precifica. É dele que a receita
  sai, e ele vem do export com custo e markup;
- o **bulário** é o que a farmácia _publica_ como referência clínica. Não tem
  preço, não tem estoque, e nada nele entra numa receita por si só.

Por isso o bulário é um módulo próprio e não uma coluna a mais no insumo. Uma
formulação do bulário pode citar um ativo que o catálogo não tem — e citar é
tudo que ela faz.

### Entra por comando, e não por migration

Mesmo padrão de `catalogo:importar` e `catalogo:restricoes`: o conteúdo é da
instalação, e uma migration com dado da farmácia falharia — ou, pior, passaria
— em toda instalação que não fosse aquela. O comando é idempotente e casa pelo
número da formulação, que é o identificador dos guias.

### Quem lê

Todo mundo que tem sessão. É material de referência clínica, não dado
comercial: não há custo, markup nem clientela aqui, e restringir por papel só
esconderia do veterinário o que a farmácia já lhe manda por e-mail.

## Consequências

- O veterinário passa a consultar sem sair do sistema, e a farmácia para de
  mandar `.docx` por WhatsApp.
- A ponte entre bulário e receita fica explicitamente adiada. Quando a
  precificação por percentual for respondida, ela destrava **duas** coisas de
  uma vez: as 340 linhas bloqueadas do catálogo e as 105 formulações daqui.
- A busca é por texto simples no Postgres. São 315 linhas — índice de texto
  completo aqui seria complexidade sem problema que a justifique.
- Reimportar um guia revisado atualiza pelo número. Se a farmácia renumerar uma
  formulação, ela entra como nova e a antiga fica — o comando diz quantas
  entraram e quantas foram atualizadas, para a diferença aparecer.
