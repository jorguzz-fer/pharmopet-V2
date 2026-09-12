# ADR 0008 — Sessão em tabela, em vez de JWT

- Status: aceito
- Data: 2026-09-12

## Contexto

A seção 6 do blueprint pede, para a web, **cookie httpOnly + Secure + SameSite**
com **revogação imediata em logout ou troca de senha**. O sistema é uma
instalação única (ADR 0002), com um servidor só (ADR 0007) e usuários na casa das
dezenas: um veterinário prescrevendo, a farmácia manipulando, a administração.

A v1 guardava um JWT e decidia permissão no front — o `role` vinha do token e a
tela escondia botões. Quem abrisse o inspetor via tudo.

## Opções consideradas

1. **JWT assinado, sem estado no servidor.** Escala sem tocar o banco a cada
   requisição e é o padrão de fato. O problema é a revogação: um token assinado
   vale até expirar, e nada do lado do servidor o impede. As saídas usuais
   reintroduzem o estado que o JWT queria evitar — lista de revogados, ou
   expiração de minutos com refresh rotativo. Nenhuma é mais simples do que uma
   tabela de sessões.
2. **Sessão em tabela, cookie com o segredo.** Uma consulta indexada por
   requisição, e revogação é uma escrita. Numa instalação com dezenas de
   usuários, essa consulta não é o gargalo de nada.

## Decisão

Sessão em tabela. No cookie vai um segredo de 32 bytes aleatórios; no banco, só
o SHA-256 dele — um dump da tabela não entrega sessão utilizável.

A revogação em massa não apaga linhas: move `usuario.sessoesValidasDesde` para o
agora, e toda sessão aberta antes disso deixa de resolver na conferência
seguinte. Uma escrita, sem varrer a tabela.

O par anti-CSRF acompanha: o cookie de sessão é httpOnly e viaja sozinho num POST
disparado por outro site — é o que torna CSRF possível. O segundo token vai num
cookie legível e precisa voltar num cabeçalho, coisa que só JavaScript da nossa
origem consegue fazer.

Toda rota nasce protegida. Abrir uma exige `@Publica()`, escrito à mão e visível
na revisão. O inverso — proteger uma a uma — depende de ninguém esquecer.

## Consequências

- Uma consulta ao banco por requisição autenticada. Indexada por hash do token, e
  o carimbo de último uso só é gravado depois de um minuto, para uma tela com
  cinco chamadas não virar cinco escritas.
- Se um dia houver app nativo ou integração de terceiro, eles não usam isto:
  cookie é mecanismo de navegador. Entram por OAuth2/OIDC, como o blueprint prevê,
  e essa é outra decisão a tomar quando o caso existir.
- Escalar horizontalmente não exige sessão compartilhada em Redis, porque o
  estado já está no Postgres que todos os nós enxergam.

## MFA: decidido não fazer

O blueprint pede **MFA obrigatório para papéis sensíveis**. Aqui não haverá, e
isso é uma decisão consciente do dono do produto, não uma pendência: um segundo
fator a cada entrada é burocracia demais para o ganho, num sistema usado o dia
inteiro por um punhado de pessoas conhecidas, dentro de uma farmácia.

A consequência está aceita: **uma senha de ADMIN que vaze dá acesso total**, sem
nenhum obstáculo a mais. O que resta no lugar é o que este PR trouxe — Argon2id,
bloqueio progressivo por conta, limite por origem, revogação imediata, e a trilha
de auditoria que registra toda entrada aceita e recusada.

Isto se revisa se a premissa mudar: um segundo prescritor externo, acesso de fora
da clínica, ou o sistema deixando de servir uma farmácia só. O modelo comporta
sem migração destrutiva — falta um campo de segredo TOTP no usuário e um passo
entre a conferência da senha e a abertura da sessão.

## O que ficou de fora por escopo

Login social OIDC, WebAuthn, verificação de e-mail e redefinição de senha por
link. A redefinição hoje é a administração criar uma senha nova — seguro, ainda
que manual, e sem depender de provedor de e-mail.
