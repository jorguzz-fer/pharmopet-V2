# ADR 0013 — O documento da receita, e o link que o tutor abre

- Status: aceito
- Data: 2026-09-13
- Depende de: [ADR 0010](0010-receita-emitida-e-imutavel.md), [ADR 0012](0012-clinica-como-entidade.md)

## Contexto

A receita emitida existe no banco e não existe em lugar nenhum que sirva a uma
pessoa. O veterinário emite e não tem o que entregar; o tutor sai da consulta
sem nada na mão; a farmácia recebe um número de receita por telefone.

São dois problemas com respostas diferentes:

1. **O documento.** Um PDF que se imprime, se guarda e se apresenta no balcão.
2. **O acesso.** O tutor não tem login e não vai ter — cadastrar tutor para ele
   ver a própria receita seria inventar uma senha que ele esquece antes de
   chegar em casa.

O v1 resolveu os dois: `pdf.service.ts` com `pdfkit`, e `publico.controller.ts`
com um token na URL. A forma está aprovada; o que muda aqui é onde o token mora
e o que o documento diz.

## Decisão

### PDF desenhado no servidor, com `pdfkit`

A alternativa séria é HTML impresso por navegador headless (Puppeteer,
Playwright): melhor tipografia, CSS de verdade, e o mesmo layout que a tela.

Pesa contra o que ela custa em produção. O contêiner passaria a precisar de um
Chromium — cerca de 300 MB, com as bibliotecas de sistema que ele exige — e de
memória para abrir uma aba por receita. Emitir receita passaria a depender de um
processo que pode travar e precisa de limite de concorrência.

`pdfkit` é JavaScript puro. Desenha por coordenada, o que é mais trabalhoso de
escrever e mais chato de mudar — e é honesto sobre isso: o layout deste
documento é fixo e não muda com frequência. Uma receita é meia folha de A4 com
cabeçalho, três blocos e uma assinatura.

Se um dia o documento precisar de layout que `pdfkit` torne penoso, a conversa
é outra e o serviço está isolado atrás de uma função.

### O token mora na receita, não no orçamento

No v1 o `token_publico` fica em `Orcamento`, porque o que o tutor abria era uma
cobrança. Aqui não existe orçamento ainda — pedido e pagamento são fases
adiante —, e o que o tutor precisa ver hoje é a **receita**.

O token nasce **na emissão**, junto do número:

- Rascunho não tem link. Um rascunho é rabisco, e rabisco com URL pública
  vazaria fórmula que ninguém conferiu.
- É gerado uma vez e congelado, como o resto (ADR 0010). Link que muda é link
  que o tutor perdeu.
- São 32 bytes de `randomBytes` em base64url. Não é sequencial e não deriva do
  id: quem tiver um link não consegue chegar no próximo.

O token é guardado como está, e não com hash. Um hash protegeria contra vazamento
do banco, mas impediria o veterinário de recuperar o link depois — e "perdi o
link, manda de novo" é o pedido mais provável que esta tela vai receber. A
proteção real é o tamanho do segredo e o que a página **não** mostra.

### A página pública mostra o mínimo

Quem tem o link vê o que a receita é, não a ficha de ninguém:

| Mostra                           | Não mostra                                  |
| -------------------------------- | ------------------------------------------- |
| Nome do tutor e do paciente      | CPF completo — só `123.***.**9-00`          |
| Espécie, peso conferido          | Telefone, endereço, e-mail                  |
| Fórmulas, posologia e quantidade | Custo de insumo, margem, condição comercial |
| Clínica, veterinário e CRMV      | Observações internas da clínica             |
| Validade e situação              | Qualquer outra receita do mesmo tutor       |

O preço aparece: é a informação que o tutor mais precisa e a razão de ele abrir
o link. O que não aparece é como ele foi formado.

**Receita cancelada continua respondendo**, e diz que está cancelada. Sumir com
a página seria pior: o tutor com o link na mão veria "não encontrado" e
concluiria que perdeu o documento, quando o que houve foi cancelamento — que ele
precisa justamente descobrir antes de ir à farmácia.

### O rodapé diz a validade de verdade

O v1 imprime "Válido por 24 horas" em toda receita. É errado em todas: o prazo
vem da lista de controle do que foi prescrito — 30 dias para um C1, 10 para
antimicrobiano, e a política de 180 dias para o que não é controlado (ADR 0010 e
`prazoDaReceita`). O documento imprime a data calculada na emissão e o motivo
dela.

Não é detalhe de rodapé: é o que o balconista lê para decidir se manipula.

## Consequências

- **A emissão passa a gerar um segredo.** O token entra no `ReceitaDto` e só
  para quem já podia ver a receita; não vai na listagem.
- **Duas rotas sem sessão**, as primeiras do sistema depois do login. Ficam com
  limite de requisições próprio e bem mais apertado que o teto geral: sem
  sessão para bloquear, o que sobra é o IP.
- **O logotipo da clínica passa a ser lido no servidor.** Já está no banco em
  coluna `Bytes` (ADR 0012), então é uma consulta e não uma ida à rede — ao
  contrário do v1, que buscava a URL do Supabase a cada PDF e seguia sem
  logotipo quando a rede falhava.
- **O app web ganha uma rota fora da área logada.** O roteador precisa distinguir
  "sem sessão, manda para o login" de "esta rota é pública de propósito".
