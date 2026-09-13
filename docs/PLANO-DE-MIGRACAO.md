# Plano de migração — v1 → v2

O que o `pharmo-project` faz hoje, o que já existe aqui, e em que ordem trazer
o resto. Documento para revisão antes de escrever código.

O v1 tem **19.233 linhas** de TypeScript. Não é um trabalho — é um roteiro, e
tem uma decisão de arquitetura no meio dele que precisa ser resolvida antes de
metade das fases fazer sentido.

---

## Inventário

Legenda: ✅ já existe no v2 · 🟡 parcial · ❌ ainda não

| #   | O que o v1 faz                                   | v2  | Onde está no v1                                                |
| --- | ------------------------------------------------ | --- | -------------------------------------------------------------- |
| 1   | Login, sessão, papéis                            | ✅  | `auth.routes`, `admin.routes`                                  |
| 2   | Recuperação de senha por e-mail                  | ❌  | `password-reset.*`, `email.service`                            |
| 3   | Catálogo de insumos e formas                     | ✅  | `insumo.routes`, `produto.routes`                              |
| 4   | Motor de preço                                   | ✅  | `precificacao.service`                                         |
| 5   | Faixa terapêutica / dose por peso                | ✅  | `validacaoClinica.*`, `RangeTerapeutico`                       |
| 6   | Tutor, paciente, receita (dados e regras)        | ✅  | `prescricao.*`, `Tutor`, `Animal`                              |
| 7   | **Tela de prescrição (wizard de 4 passos)**      | ✅  | `PrescriptionWizard/`, `MagistralBuilder`                      |
| 8   | PDF da receita, com marca da clínica             | ✅  | `pdf.service`, `documento.service`                             |
| 9   | Link público para o tutor abrir sem login        | 🟡  | `publico.routes`, `PublicOrder`, `OrderStatus`                 |
| 10  | Bulário magistral: busca formulação por doença   | ❌  | `BularioMagistral`, `bulario`                                  |
| 11  | Assistente de IA com RAG sobre o bulário         | ❌  | `ai-assistant.service` (OpenAI)                                |
| 12  | Pedido e estado da produção                      | ❌  | `Pedido`, `PedidoStatus`                                       |
| 13  | Pagamento (Mercado Pago)                         | ❌  | `mercadopago.service`, `pagamento.service`, `cobranca.service` |
| 14  | Envio ao tutor por WhatsApp                      | ❌  | `whatsapp.service`                                             |
| 15  | Painel admin: dashboards e relatórios            | ❌  | `pages/admin/*` (12 telas)                                     |
| 16  | Follow-up de tutores                             | ❌  | `FollowUp`, `AdminFollowUps`                                   |
| 17  | **Clínicas: entidade, login próprio, dashboard** | ✅  | `Clinica`, `clinica-auth.routes`, `pages/clinic/*`             |
| 18  | Integração Prisma Five (ERP da farmácia)         | ❌  | `prismaFive.service`                                           |
| 19  | Armazenamento de arquivos (logo, documentos)     | ❌  | `storage.service`                                              |

---

## A decisão que trava o resto

**O v1 trata clínica como entidade de primeira classe:** ela tem cadastro,
login próprio (`/clinica/login`), dashboard, lista de veterinários vinculados e
documentos. Um veterinário pertence a uma clínica, e a receita carrega
`clinica_id`.

**A ADR 0002 deste repositório decidiu o contrário:** instalação única, sem
multitenancy. E a ADR 0011 resolveu a visibilidade por autor justamente porque
não há clínica para escopar.

As duas coisas não convivem. Antes das fases 15 e 17 — e antes de o PDF saber
de quem é a marca que ele imprime — é preciso escolher:

**(a) Manter a ADR 0002.** Uma instalação por farmácia. Clínica vira, no
máximo, um campo de texto na receita. Mais simples, e joga fora o cadastro de
clínica do v1.

**(b) Revisar a ADR 0002 e trazer clínica de volta.** Vira uma fase própria:
entidade, vínculo veterinário-clínica, escopo por clínica em vez de por autor,
e a pergunta de o que acontece quando um veterinário atende em duas. Reescreve
a ADR 0011 junto.

Não dá para adiar: a fase 7 (tela de prescrição) já precisa saber se a receita
tem clínica, e o PDF precisa saber de quem é o logotipo.

---

## Pedidos da reunião de 11/09/2026

Alinhados com Marcos Brasil na revisão fina do v1, e portanto **aprovados**.
Estão aqui porque são requisito de produto que o inventário acima não captura —
não são coisas que o v1 já faz, são coisas que ele ainda vai fazer.

| O que                                                                           | Onde entra          | Feito |
| ------------------------------------------------------------------------------- | ------------------- | ----- |
| Multiplicador de frequência no cálculo de insumo (24h→×1, 12h→×2, 8h→×3, 6h→×4) | posologia           | ✅    |
| Quantidade definida depois de escolhidos todos os ativos                        | montagem da fórmula | ✅    |
| Endereço, telefone e CNPJ da farmácia no documento impresso                     | documento           | ✅    |
| Endereço de entrega no cadastro, com escolha entre clínica e tutor              | cadastro + pedido   | ❌    |
| Aroma na forma farmacêutica: carne, frango, banana, morango                     | catálogo + fórmula  | ❌    |
| Campo de uso contínuo, ao lado da quantidade                                    | montagem da fórmula | ❌    |
| Pancreatina, ciclosporina e SAM só em cápsula — alerta se pedir biscoito        | catálogo            | ❌    |
| Mensagem de "pedido em análise" ao enviar por WhatsApp                          | notificações        | ❌    |

Três observações sobre a lista:

1. **O multiplicador de frequência já está feito**, e era o item mais pesado. O
   v1 multiplicava miligrama por dias e ignorava a posologia, o que subestima o
   insumo em três vezes numa fórmula de 8 em 8 horas. Aqui
   `quantidadeDeDoses(frequenciaHoras, dias)` existe desde a fase 3, conferida
   contra a planilha `CALCULADORA_POSOLOGIA.xlsx`.
2. **A restrição de biscoito já tem onde morar**: `RestricaoDeForma` no catálogo
   é exatamente isso, e o v2 já a aplica como impedimento. Falta cadastrar as
   três linhas — pancreatina, ciclosporina e SAM contra a forma biscoito.
3. **O endereço da farmácia é configuração**, não cadastro: `FARMACIA_NOME`,
   `FARMACIA_CNPJ`, `FARMACIA_ENDERECO` e `FARMACIA_TELEFONE`. Sem os quatro, o
   rodapé sai sem o bloco — os valores reais foram mostrados em tela na reunião
   e ainda não chegaram por escrito.

---

## Ordem proposta

Cada linha é um PR, na sequência que já usamos.

### Fase 5 — Tela do receituário

A API da fase 4 existe inteira e ninguém consegue usá-la sem `curl`. Busca de
tutor, ficha do paciente com peso, montagem da fórmula com preço e avisos ao
vivo, emissão. É o item 7 do inventário, e era a **prioridade nº 1 da reunião**
registrada em `analise-reuniao-implementacao.md` do v1.

Depois desta fase o sistema é usável por um veterinário de verdade.

### Fase 6 — Documento e link do tutor

PDF da receita e a página pública que o tutor abre sem login (itens 8 e 9).
Fecha o ciclo: o vet prescreve, o tutor recebe.

Depende da decisão acima: o cabeçalho do PDF é da clínica ou da farmácia.

### Fase 7 — Bulário magistral

Busca de formulação por doença, sem IA (item 10). É cadastro e consulta; o
valor está em o veterinário não precisar montar a fórmula do zero.

### Fase 8 — Pedido e fila da farmácia

Item 12. `podeSerAtendida` já está pronto em `@pharmopet/shared` esperando.

### Fase 9 — Pagamento

Item 13. Precisa de decisão de gateway e de credenciais reais.

### Fase 10 — Notificações

WhatsApp e e-mail (itens 14 e 2). Precisa das credenciais que ainda faltam.

### Fase 11 — Painel administrativo

Item 15, e o 16 junto. Doze telas no v1; provavelmente menos aqui, porque
relatório que ninguém abre é tela que só custa manutenção.

### Fase 12 — Assistente de IA

Item 11, por último de propósito. Uma IA que sugere posologia é superfície de
risco clínico, e merece ADR própria antes de existir: o que ela pode afirmar, o
que precisa passar por farmacêutico, e como se registra que passou. O v1 já
acertou parte disso com o `NECESSITA_FARMACEUTICO`.

### Fora de escopo por ora

- **Prisma Five** (item 18): depende de API que a farmácia precisa fornecer.
- **E-commerce**: citado na reunião como prazo mais longo, sem especificação.

---

## O que não vai ser portado como está

Trazer 19 mil linhas não é o objetivo — o v2 existe porque o v1 acumulou coisas
que não deveriam voltar. Três exemplos concretos:

1. **Três sistemas de login** (veterinário, admin, clínica), cada um com o seu
   fluxo de senha. Aqui há um só, com papel.
2. **Campos `DEPRECATED` na prescrição** — `medicamento`, `dosagem`,
   `forma_farmaceutica` e `quantidade` convivem em `Prescricao` com a tabela
   `PrescricaoMedicamento` que os substituiu. O modelo do v2 já nasceu sem eles.
3. **Preço em `Decimal` com `Number()` no meio da conta.** A ADR 0009 resolveu.

---

## Riscos que valem dizer agora

- **Credenciais.** Pagamento, WhatsApp e IA dependem de chaves que hoje estão
  no ambiente antigo. As fases 9, 10 e 12 param sem elas.
- **O catálogo real precifica 44%.** As quatro perguntas abertas para a farmácia
  (PR #5) limitam o que qualquer tela consegue mostrar.
- **Os 180 dias de validade de receita comum** seguem sem confirmação.
