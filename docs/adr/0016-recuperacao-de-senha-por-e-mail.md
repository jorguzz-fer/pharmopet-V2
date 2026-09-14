# 16. Recuperação de senha por e-mail

Data: 2026-09-13

## Situação

A v2 nasceu sem recuperação de senha. Quem esquecia a senha dependia de um
administrador abrir o banco, e a tela de entrada dizia isso com todas as
letras: _"Fale com a administração — por segurança, a redefinição não é
automática."_ A frase era honesta e era ruim: a farmácia atende clínicas em
horário comercial, e o veterinário que precisa prescrever às 20h de um sábado
não tem administrador para chamar.

Pior, a ausência interagia mal com o bloqueio progressivo da fase 2. Cinco
senhas erradas trancam a conta por meia hora, e o bloqueio não distingue quem
ataca de quem só não lembra. Sem saída automática, errar a senha virava um
problema que só o dia seguinte resolvia.

A v1 já tinha o fluxo, aprovado e em uso
(`packages/server/src/services/password-reset.service.ts`): token aleatório,
validade de uma hora, tokens anteriores invalidados a cada pedido novo, e a
mesma resposta exista ou não a conta. Envio pelo Resend.

## Decisão

Portar o desenho da v1, com uma mudança.

**O que veio igual:**

- Token de 32 bytes aleatórios, válido por **uma hora**.
- Um pedido novo **invalida os anteriores**. Dois links vivos na mesma caixa
  de entrada dobram a janela de quem conseguir ler o e-mail antigo.
- Uso **único**: o token é marcado como gasto na mesma transação que troca a
  senha, para dois cliques no link não valerem duas trocas.
- **A mesma resposta exista ou não a conta** — 204 para todos os casos. É a
  parte que mais importa: aqui o e-mail do veterinário é o identificador, e
  uma resposta que distinguisse entregaria a carteira de clientes da farmácia
  a quem chegasse com uma lista de endereços. Vale também para conta
  desativada.
- Envio pelo Resend.

**O que mudou: o token é guardado com hash.**

A v1 guardava o token em texto claro na coluna. A v2 guarda o SHA-256 e busca
pelo hash. O raciocínio é o mesmo que levou a senha para o Argon2id: um dump
do banco — backup perdido, SQL injection em outro ponto, acesso indevido ao
console do provedor — não pode entregar as chaves de todas as contas que
pediram redefinição na última hora.

Não é Argon2id porque o problema é outro: o token tem 256 bits de entropia
aleatória, então não há dicionário a percorrer e o custo de derivação não
compra nada. SHA-256 sobre um segredo já aleatório basta, e roda numa rota
pública sem virar alvo de exaustão de CPU.

**Outras escolhas:**

- **Trocar a senha derruba todas as sessões** (`sessoesValidasDesde`) e limpa
  o bloqueio por tentativas. Quem redefine costuma estar redefinindo porque
  desconfia que alguém entrou; trocar a fechadura e deixar a sessão do outro
  de pé não resolveria nada. E foi o bloqueio que trouxe a pessoa até aqui.
- **A instalação sem e-mail configurado responde 503**, e a tela diz isso.
  É a única resposta desta rota que não é uniforme, e é deliberado: não fala
  de conta nenhuma, e aceitar em silêncio deixaria a pessoa esperando para
  sempre um link que ninguém vai mandar.
- **A chave e o remetente vêm do ambiente** (`RESEND_API_KEY`,
  `EMAIL_REMETENTE`, `URL_PUBLICA`), todos opcionais. Credencial de envio em
  nome do domínio da farmácia não mora no repositório.
- **O envio fala com o Resend por `fetch`**, e não pelo SDK que a v1 usava.
  É uma requisição só, e uma dependência a menos para auditar numa aplicação
  que manipula receita controlada.
- **A tela repete a uniformidade do servidor.** A confirmação diz _"se houver
  uma conta com este endereço"_, nunca _"enviamos"_. Uma tela que afirmasse a
  existência desfaria, na redação, a proteção que a API mantém no código — e
  há um teste que falha se alguém "melhorar" esse texto.
- **Sem MFA**, conforme já decidido (ADR 0008 e a conversa de 11/09). Isto é
  recuperação de senha, não uma segunda via de autenticação.

## Consequências

**Boas.** O veterinário volta a trabalhar sozinho, a qualquer hora. O bloqueio
por tentativas deixa de ser uma porta sem chave. A trilha de auditoria ganha
`REDEFINICAO_PEDIDA`, que registra também o pedido não atendido com o endereço
digitado — é o que permite ver alguém varrendo uma lista de e-mails.

**Ruins, e aceitas.** Quem controla a caixa de entrada controla a conta: é o
preço de qualquer recuperação por e-mail, e a razão de a janela ser de uma
hora. A instalação passa a depender de um serviço externo para uma função de
acesso; quando o Resend está fora, o caminho antigo (administrador abre o
banco) continua existindo.

**Pendente.** A conta do Resend e o domínio remetente da v1
(`noreply@pharmopet.com.br`) ainda precisam ser confirmados pelo cliente. O
código não depende da resposta — a chave vem do ambiente, e sem ela a rota
diz honestamente que não está configurada.
