# 17. O painel, e o que ele pode dizer

Data: 2026-09-13

## Situação

A v2 abre na lista de receitas. Funciona, mas não responde às perguntas que
alguém faz ao chegar de manhã: quantas saíram ontem, o que está parado
esperando decisão minha, quanto disso virou dinheiro.

A v1 tinha **três** painéis separados — `Dashboard` (veterinário),
`AdminDashboard` e `ClinicDashboard` —, cada um com sua rota, seu endpoint e
sua cópia da lógica de contagem.

## Decisão

Um painel só, em `/`, e **um endpoint só**: `GET /painel`. O que muda entre os
papéis é o recorte dos dados e quais blocos aparecem, não o código que conta.

O recorte vem de `escopoDeReceita`, o mesmo filtro que a listagem de receitas
já usa (ADR 0011 e 0012). Isso não é economia de digitação: é o que torna
impossível o painel discordar da lista. Um segundo filtro escrito à mão para o
painel seria um segundo lugar para a regra de visibilidade divergir — e a
divergência apareceria como um veterinário vendo no total um número maior do
que a lista dele mostra, que é vazamento de carteira de clientes disfarçado de
métrica.

### O painel não diz "faturamento"

Esta é a decisão que mais importa, e é onde a v2 se afasta da v1 de propósito.

A v1 mostrava um cartão **"Faturamento (Mês)"** somando `orcamento.valor_total`
de _todo_ orçamento criado no mês — o comentário no código diz literalmente
`ALL budgets from current month (not just PAID)`. Ou seja: dinheiro que alguém
_talvez_ pague, apresentado como dinheiro que entrou. Um rascunho abandonado
entrava no faturamento.

A v2 não tem meio de pagamento ainda (a fase 9 depende de decisões que são do
cliente), então não há um único número no banco que signifique "recebido".
Diante disso há duas saídas, e uma delas é mentir bonito.

O cartão se chama **"Valor prescrito"**, soma só `formulacao.valorEmCentavos`
de receitas **emitidas** — nunca rascunho, que é cotação, e cotação muda — e o
texto abaixo dele diz que é o valor das receitas emitidas, não o que foi pago.
Quando o pagamento existir, aí sim cabe um cartão de faturamento ao lado, e os
dois vão dizer coisas diferentes de propósito.

### O que cada papel vê

- **Veterinário**: as receitas dele e as da clínica onde atende. Rascunhos
  parados, emitidas no mês, vencendo nos próximos dias, valor prescrito, e as
  últimas receitas.
- **Farmácia e administração**: tudo, mais a fila de pedidos por estado — é o
  trabalho do dia — e os veterinários que mais prescreveram.
- **Clínica**: o que saiu na clínica dela, e só.

O bloco de "top veterinários" só existe para quem vê tudo. Mostrá-lo a um
veterinário seria ranquear colegas para quem não tem por que compará-los, e
entregar volume de prescrição alheio de quebra.

### Números do mês corrente, não dos últimos 30 dias

"Este mês" é o que a farmácia usa para fechar conta, e é o que a v1 usava.
Janela móvel de 30 dias daria um número que não bate com nenhum fechamento.

## Consequências

**Boas.** Quem entra vê o que fazer. A fila de pedidos deixa de depender de
alguém lembrar de abrir a aba. E o escopo compartilhado significa que uma
correção na regra de visibilidade corrige os dois lugares de uma vez.

**Ruins, e aceitas.** Um painel é mais uma consulta no login de todo mundo;
as contagens são agregações no Postgres, sem cache, e vão ficar mais caras
conforme a base cresce. Aceito por ora: a instalação é uma farmácia (ADR 0002),
e otimizar antes de haver volume é otimizar no escuro. Se pesar, o caminho é
uma view materializada, não espalhar contadores pelas escritas.

**A lista de receitas muda de endereço.** Sai de `/` para `/receitas`. Link
antigo que alguém tenha guardado passa a cair no painel, que é uma tela útil —
e não num 404.

**Pendente.** Um cartão de faturamento de verdade, quando a fase 9 existir.
Está anotado aqui para não ser reinventado como "melhorar o cartão de valor
prescrito", que seria voltar ao erro da v1.
