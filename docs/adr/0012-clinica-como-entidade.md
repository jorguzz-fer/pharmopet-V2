# ADR 0012 — Clínica como entidade, e o que isso revoga da ADR 0002

- Status: aceito
- Data: 2026-09-13
- Revoga parcialmente: [ADR 0002](0002-instalacao-unica-sem-multitenancy.md)
- Altera: [ADR 0011](0011-clientela-visivel-so-para-quem-cadastrou.md)

## Contexto

A ADR 0002 fixou instalação única, sem multitenancy: uma farmácia, um banco,
sem cadastro de organização. A ADR 0011 resolveu a visibilidade da clientela
escopando por autor, justamente porque não havia clínica para escopar.

Ao planejar o documento da receita, a pergunta ficou concreta: **de quem é o
logotipo impresso no cabeçalho?** A resposta do cliente foi direta — da clínica
que pediu a receita, puxado do cadastro dela.

Isso não é um campo a mais. Uma clínica que tem cadastro, logotipo e recebe a
receita no próprio nome é uma entidade, e o `pharmo-project` já a tratava
assim: cadastro com CNPJ e responsável legal, documentos anexos, vínculo
muitos-para-muitos com veterinários, e — o que mais pesa — **condições
comerciais próprias**.

Esse último ponto é o que torna a decisão inevitável. O v1 guarda por clínica a
taxa de manipulação, o custo de embalagens, o desconto de parceiro e os
adicionais de entrega e de biscoito. Preço negociado por parceiro não cabe numa
linha única de condições.

O comentário de `CondicoesComerciais`, escrito na fase 3, já previa isto:

> Hoje a farmácia pratica as mesmas condições para todo mundo; quando houver
> cadastro de clínica com termos negociados, isto vira uma linha por clínica —
> e o motor de precificação não muda, porque já recebe as condições por
> parâmetro.

A previsão venceu.

## Opções consideradas

1. **Clínica como texto na receita.** Um campo `clinicaNome` e um logotipo
   configurado na instalação. Resolve o cabeçalho e nada mais: não comporta
   preço por parceiro, nem responde quem pode ver o quê quando duas clínicas
   usam o mesmo sistema.
2. **Multitenancy de verdade**, com isolamento por banco ou por schema. É o que
   se faz quando os inquilinos não podem se ver de jeito nenhum. Aqui eles
   compartilham deliberadamente a farmácia, o catálogo e o bulário — isolar por
   banco criaria o problema inverso, de manter catálogo replicado.
3. **Clínica como entidade dentro da instalação única.** Uma farmácia, um
   banco, vários parceiros cadastrados, com escopo por vínculo.

## Decisão

Opção 3.

A ADR 0002 continua valendo no que importava: **uma instalação por farmácia**,
um banco, sem replicação de catálogo. O que ela dizia sobre não haver cadastro
de organização fica revogado.

- **`Clinica`** carrega identidade (razão social, nome fantasia, CNPJ),
  endereço, contato, responsável legal, logotipo e condições comerciais.
- **`ClinicaVeterinario`** é muitos-para-muitos, como no v1: um veterinário
  atende em mais de uma clínica, e a receita diz em qual delas foi emitida.
- **`Receita.clinicaId`** é escolhida no rascunho e congelada na emissão, junto
  com o nome e o CNPJ. O documento não pode mudar de cabeçalho quando o
  cadastro mudar.
- **Condições comerciais passam a ter dono.** A linha sem clínica continua
  existindo como padrão da casa; a com clínica prevalece. O motor de
  precificação não muda uma linha — recebe as condições por parâmetro desde a
  fase 3.

### Três áreas, um login

O v1 tem três frentes separadas, e elas são requisito de produto:

```
/veterinario  login · dashboard · nova prescrição · pedidos
/clinica      login · dashboard · prescrições · veterinários
/admin        login · dashboard · clínicas · veterinários · insumos · relatórios
```

As **três áreas ficam**. O que não volta são os **três logins**.

A distinção importa. O v1 tem três armazéns de credencial — `Veterinario`,
`UsuarioAdmin` e `senha_hash` dentro de `Clinica` —, cada um com o seu fluxo de
recuperação de senha. São três lugares para uma senha vazar, três lugares para
corrigir quando o algoritmo de hash envelhecer, e três chances de um deles ficar
para trás. Foi um dos motivos declarados da reconstrução, e o plano de migração
o registra como coisa a não trazer de volta.

Aqui a entrada é uma só, com papel (ADR 0008), e o papel decide a área. Quem
opera uma clínica é um `Usuario` de papel `CLINICA` vinculado a ela.

Consequência direta: o enum `Papel` ganha **`CLINICA`**. Passa a ser ADMIN,
VETERINARIO, FARMACIA e CLINICA.

A pessoa vê a mesma coisa que veria no v1; o sistema tem um armazém de
credencial em vez de três.

### Logotipo no banco, e não em serviço de arquivo

O v1 guarda o logotipo no Supabase Storage. Aqui ele vai para uma coluna
`Bytes`, com o tipo MIME ao lado, servido por uma rota própria.

O motivo é operacional: o contêiner não tem volume persistente, e um serviço de
arquivos externo traria uma dependência, credenciais para rotacionar e mais um
sistema para estar fora do ar. Um logotipo tem dezenas de quilobytes e uma
clínica tem um. É pequeno o bastante para caber no banco que já é copiado em
backup, e grande o bastante para não valer uma conta de S3.

Se um dia entrarem documentos da clínica — contrato social, cartão de CNPJ, como
no v1 —, aí sim a conversa muda, porque são muitos e maiores. Aquele dia pede
outra decisão, não esta.

A rota do logotipo exige sessão e responde `Cache-Control: private`, porque é
imagem de parceiro. A URL não muda quando o arquivo muda, então a tela põe a
data de atualização da clínica na query. Um contador dentro do componente não
resolveria: ele zera quando a tela é remontada, e não faria diferença nenhuma
para o navegador de quem não fez o envio.

## Consequências

- **A ADR 0011 muda de eixo.** A visibilidade deixa de ser por autor e passa a
  ser por clínica: quem atende numa clínica vê a clientela dela. É mais útil
  (dois veterinários da mesma clínica atendem o mesmo tutor) e mais defensável
  (a ficha é da clínica, não do profissional). Tutor e paciente cadastrados sem
  clínica continuam visíveis só a quem os cadastrou.
- **O preço passa a depender de quem pediu.** A mesma fórmula sai por valores
  diferentes em clínicas diferentes, e isso é intencional. A cotação precisa
  saber a clínica antes de mostrar número.
- **A receita precisa de clínica para ser emitida** quando o veterinário tem
  vínculo. Sem vínculo nenhum, emite no nome da farmácia — o caso do
  profissional autônomo.
- **Sobra trabalho de administração**: cadastrar clínica, vincular veterinário,
  subir logotipo. São telas de ADMIN, e existem porque o cadastro agora tem
  consequência no preço e no documento.
- **A API ganha uma listagem de usuários** (`GET /auth/usuarios`, só ADMIN).
  Vincular alguém a uma clínica exige escolher quem, e pedir o UUID na mão
  convidaria ao erro de colar o id errado — que dá a uma pessoa a clientela de
  outra clínica. Fica restrita a administrador porque é uma lista de e-mails de
  pessoas reais: entregá-la a qualquer sessão seria dar de graça o alvo de
  qualquer tentativa de adivinhar senha.
