# ADR 0009 — Dinheiro em inteiro, e o custo fora da resposta

- Status: aceito
- Data: 2026-09-12

## Contexto

A seção 10 do blueprint pede dinheiro em `numeric` ou inteiro de centavos. A v1
usava `Decimal` no banco e `Number()` no código, o que na prática significa ponto
flutuante em toda conta, com `Math.round(n * 100) / 100` aplicado a cada
ingrediente antes de somar.

Dois problemas concretos disso, e não teóricos:

1. **O total dependia da ordem dos itens.** Arredondar por ingrediente e somar
   dá resultado diferente de somar e arredondar. Numa fórmula com cinco ativos
   baratos, a diferença chega a centavos — pouco por receita, e não pouco num
   fechamento de mês.
2. **Custo de insumo não cabe em centavo.** Um ativo custa na casa de R$ 0,035
   por grama; uma fórmula usa fração de grama. Arredondar isso a centavo antes
   de multiplicar joga fora a maior parte do valor.

Em paralelo, há uma regra de negócio explícita, dita pela farmácia nas reuniões:
**preço por ingrediente, markup e desconto não aparecem** — nem para o
veterinário, nem para a clínica, nem para o tutor. A v1 mandava tudo na resposta
e escondia na tela.

## Opções consideradas

1. **Biblioteca de decimal** (decimal.js, dinero.js). Resolve a aritmética e
   traz uma dependência, um tipo que atravessa toda fronteira de serialização e
   a pergunta recorrente de como gravar no banco.
2. **Inteiro, em duas escalas.** Centavo para o que se paga, micro-real (10⁻⁶
   BRL) para custo unitário. A conta roda em `bigint` e arredonda uma vez.

## Decisão

Inteiro, em duas escalas, e o nome do campo diz qual: `...EmCentavos` ou
`...EmMicro`. A mesma disciplina vale para grandeza física — `...EmMiligramas`,
`...EmMicrogramas`, `...EmGramas` — porque meio quilo de calopsita virando `0.5`
no meio de um cálculo de dose é o mesmo erro com outra unidade.

O motor de precificação é **função pura** em `@pharmopet/shared`: recebe insumos,
itens e condições comerciais, devolve o cálculo. Não abre conexão. É o que
permite testar a aritmética sem infraestrutura, e é o que vai permitir que as
condições venham de uma clínica, quando houver cadastro de clínicas, sem tocar
no cálculo.

E o recorte por papel acontece **na resposta, não na tela**: o endpoint de
orçamento devolve valor final, avisos e impedimentos, e só. A composição do
preço vive noutro endpoint, restrito a `ADMIN` e `FARMACIA`. O que chega ao
navegador é visível para quem abrir o inspetor — foi assim que a v1 entregou o
papel do usuário dentro do token.

## Consequências

- Quem lê um valor precisa dividir para exibir. `formatarReais` faz isso num
  lugar só.
- `bigint` não é serializável em JSON. Fica contido no motor: a fronteira do
  módulo já devolve `number` em centavos.
- Os itens do orçamento detalhado, arredondados um a um, podem não somar
  exatamente o total — que é calculado sem passar por esses arredondamentos. O
  total é o que vale; o detalhe é conferência. Está escrito no código, onde
  alguém vai reparar na diferença.
- Toda faixa terapêutica também é inteira, em micrograma por quilo. Cadastro em
  mg/kg com uma casa continua exato: 2,5 mg/kg é 2500.
