# Bases da farmácia

Material de origem: o bulário magistral e as planilhas de catálogo e preço que
a PharmoPet usa hoje. Nada aqui é lido pela aplicação em tempo de execução —
são a fonte a partir da qual o banco é populado, e ficam versionados para que
uma importação possa ser refeita e conferida contra a mesma entrada.

Os nomes foram normalizados na entrada. Os originais traziam emoji, espaço,
parêntese e acento em forma decomposta (NFD), combinação que quebra script de
importação de formas difíceis de diagnosticar — `open()` falha com
`FileNotFoundError` num arquivo que o `ls` mostra na tela.

---

## `bulario/` — 19 guias, um por linha terapêutica

`.docx`, numerados na ordem que a farmácia usa. Estrutura regular por
formulação, o que os torna extraíveis sem IA:

```
11.3 Cápsulas de Pimobendan
Forma farmacêutica: Cápsula oral
Indicação: ...
Diferencial: ...
Fórmula magistral:
  • Pimobendan 0,25 mg/kg/cápsula
  • Excipiente específico q.s.p. 60 cápsulas
Modo de usar: Administrar 1 cápsula a cada 12 horas.
Observações: ...
```

Duas coisas a notar antes de importar:

1. **A dose vem em duas escalas.** `0,25 mg/kg/cápsula` é por peso;
   `6,25–12,5 mg/animal/cápsula` (comum em gato) é absoluta. O modelo
   `FaixaTerapeutica` de hoje só representa a primeira.
2. **A faixa é um intervalo**, não um valor. `0,5–2 mg/kg` casa com
   `doseMinima`/`doseMaxima` da faixa terapêutica.

## `planilhas/`

| arquivo                                | o que é                                                                        | forma                                 |
| -------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| `resumo-principio-ativo.xlsx`          | **o bulário em tabela** — 1.996 linhas, uma por ativo dentro de uma formulação | tabela limpa                          |
| `resumo-principio-ativo-jorge.xlsx`    | a mesma coisa, com uma coluna de id simplificado a mais                        | tabela limpa                          |
| `base-preco-2026-01-28.xlsx`           | preço por produto: `Sugestão de Venda` (ao tutor) e `Tabela Venda` (à clínica) | tabela limpa                          |
| `tabela-preco-combos-2026-01-28.xlsx`  | preço de combos                                                                | relatório com cabeçalho de página     |
| `base-principio-ativo-2026-01-22.xlsx` | catálogo de insumos com custo, markup e unidades                               | relatório, **duas linhas por insumo** |
| `planilha-rodrigo.xlsx`                | tabela dinâmica de trabalho                                                    | pivô                                  |
| `relatorio-produto.xls`                | exportação do sistema da farmácia, formato XLS antigo                          | binário legado                        |

### `resumo-principio-ativo.xlsx` é a mais útil

```
id | ID_produto | Linha | Nome Produto | Principio ativos | Qtd | Medida | Medida por
 1 |    1.1     | Linha Antialérgica | Petisco de Cetirizina | Cetirizina HCl | 1 | mg | kg
```

É o bulário já legível por máquina. `Medida por` distingue as duas escalas de
dose citadas acima.

### `base-preco` usa outro modelo de preço

Dois preços fixos por produto. O motor de precificação deste repositório
calcula preço a partir de custo × markup (ADR 0009), que é outra coisa.

Se os dois convivem — magistral pelo motor, produto acabado pela tabela — ou se
um substitui o outro, é pergunta aberta para a farmácia.

### `base-principio-ativo` tem a mesma forma do export que já foi conferido

Colunas: `Produto`, `Descrição`, `Un. Manip.`, `Un. Estoque`, `Cálculo`,
`Valor Custo`, `Custo Referência`, `Markup`, `Valor Venda`, `Situação`.

São os mesmos campos do `insumos.json` que a ferramenta `catalogo:conferir`
já lê — com cerca de 1.780 insumos, contra os 702 daquele. **E traz `Un.
Manip.` e `Un. Estoque` em colunas separadas**, que é exatamente a pergunta
em aberto sobre em que unidade o estoque está.

O arquivo é um relatório impresso exportado para xlsx: cada insumo ocupa duas
linhas, a primeira com código, descrição e unidade, a segunda com os valores.
Precisa de um parser próprio — não dá para lê-lo como tabela.

---

## Sobre versionar binário

São ~5 MB que ficam no histórico do git para sempre. Vale enquanto forem
material de referência que muda raramente. Se passarem a ser atualizados a cada
export da farmácia, o caminho é tirá-los do git e trazê-los por download no
momento da importação.
