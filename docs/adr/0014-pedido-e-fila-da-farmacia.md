# ADR 0014 — O pedido, e a fila da farmácia

- Status: aceito
- Data: 2026-09-13
- Depende de: [ADR 0010](0010-receita-emitida-e-imutavel.md), [ADR 0012](0012-clinica-como-entidade.md), [ADR 0013](0013-documento-da-receita-e-link-do-tutor.md)

## Contexto

A receita hoje é emitida, vira PDF e chega ao tutor por um link. E para.

A farmácia não sabe que ela existe. O caminho real, hoje, é o veterinário
mandar o PDF por WhatsApp e alguém digitar de novo do outro lado — que é
exatamente o retrabalho que este sistema existe para eliminar.

Falta a peça entre prescrever e manipular: **o pedido**. É o item 12 do
inventário, e `podeSerAtendida` está em `@pharmopet/shared` desde a fase 4
esperando por ele.

## Decisão

### Quem manda o pedido é quem prescreve

Não o tutor. Ele vê e acompanha, mas não encomenda.

É tentador pôr um botão "quero este medicamento" na página pública — e seria
e-commerce, que o plano deixou fora de escopo por não ter especificação. Pior:
abriria um caminho em que a farmácia recebe pedido de alguém que não é
identificável pelo sistema, para manipular controlado.

O fluxo alinhado com o cliente é o do v1: quem prescreve envia, a farmácia
recebe, e o atendimento continua por WhatsApp. Foi descrito na reunião de
11/09 nestes termos — "eu vou checar lá os envios e vai chegar no meu WhatsApp
e a gente vai continuar o atendimento ali".

### Só receita válida vira pedido

`podeSerAtendida` já é a regra: rascunho não, vencida não, cancelada não. Aqui
ela sai da prateleira e passa a barrar o envio.

E **uma receita tem no máximo um pedido vivo**. Sem isso, dois cliques no botão
viram duas manipulações do mesmo controlado — o erro mais caro que esta tela
pode cometer. Cancelado o pedido, a mesma receita pode ser enviada de novo
enquanto estiver válida.

### Cinco estados, e as transições são regra, não convenção

```
EM_ANALISE ──► EM_PRODUCAO ──► PRONTO ──► ENTREGUE
     │              │             │
     └──────────────┴─────────────┴──────► CANCELADO
```

- **EM_ANALISE** é o estado de nascimento, e o nome não é decorativo: é o que o
  cliente pediu que a mensagem dissesse ao tutor — "seu pedido está em análise
  e logo entraremos em contato".
- **ENTREGUE é final.** De lá não se sai, nem para cancelar: o remédio já está
  com o tutor, e um pedido que volta de entregue para em produção é um
  histórico que mente sobre o que aconteceu.
- **CANCELADO é final** pelo mesmo motivo. Recomeçar é enviar a receita de novo.

As transições ficam numa função pura em `@pharmopet/shared`, ao lado das
regras de validade. O motivo é o de sempre: a tela precisa saber quais botões
mostrar e a API precisa saber o que recusar, e duas cópias da mesma tabela
divergem — com a do servidor divergindo em silêncio.

O v1 tinha seis estados, com `AGUARDANDO_PAGAMENTO` e `PAGAMENTO_CONFIRMADO`
no começo. Eles não entram agora porque pagamento é a fase seguinte, e um
estado que nada produz nem consome é um estado que alguém vai interpretar
errado. Acrescentá-los depois é uma migration de enum, das baratas.

### O destino da entrega é congelado no pedido

O cliente pediu endereço de entrega no cadastro, "se ele quiser mandar pra
clínica ele decide, se quiser mandar para cliente ele decide".

São duas coisas:

1. **O cadastro do tutor ganha endereço de entrega**, separado do endereço da
   ficha. Quem mora num lugar e recebe em outro é comum, e usar o endereço de
   cadastro como se fosse o de entrega é como se erra a rota.
2. **O pedido congela para onde foi.** Guarda o destino escolhido — clínica ou
   tutor — e o endereço por extenso, como ele estava no dia. Mudar o cadastro
   depois não pode reescrever para onde a encomenda seguiu; é a mesma
   disciplina do nome e do CNPJ da clínica na receita (ADR 0012).

Sem endereço nenhum cadastrado, entregar no tutor é recusado com o motivo — e
não aceito para virar um pedido que a farmácia não consegue despachar.

### Quem vê o quê

- **FARMACIA e ADMIN** veem a fila inteira. É o trabalho deles.
- **VETERINARIO e CLINICA** veem os pedidos das receitas que já enxergavam,
  pelo mesmo escopo da ADR 0012. Nada de novo: o pedido herda a visibilidade
  da receita que o originou, em vez de inventar uma regra paralela que
  divergiria na próxima mudança.
- **O tutor** acompanha pelo link que já tem. O estado do pedido entra no
  resumo público; o que não entra continua não entrando (ADR 0013).

**Só FARMACIA e ADMIN mudam o estado.** Quem prescreve pode cancelar o pedido
enquanto ele está em análise — antes de alguém ter começado a pesar insumo —,
e depois disso precisa falar com a farmácia. É o que corresponde ao que é
reversível de verdade.

## Consequências

- **A receita ganha um estado que não é dela.** Cuidado deliberado: a receita
  continua imutável, e quem muda é o pedido. Nenhuma transição de pedido
  escreve em `Receita`.
- **A fila é a primeira tela pensada para a farmácia.** Até aqui o sistema
  tinha telas de quem prescreve e de quem administra; esta é de quem produz, e
  ordena por chegada porque é assim que a bancada trabalha.
- **A mensagem de "em análise" existe antes do WhatsApp.** O envio por WhatsApp
  é a fase 10; a frase que o cliente pediu aparece agora na confirmação e na
  página do tutor, que é onde ela informa alguém.
- **Toda mudança de estado é auditada**, com quem fez e quando. Um pedido de
  controlado que muda de mão sem registro é o tipo de coisa que só se descobre
  quando alguém pergunta, e aí já não há como responder.
