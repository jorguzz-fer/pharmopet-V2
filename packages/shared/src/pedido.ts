/**
 * O pedido: os estados por que passa e as mudanças que são permitidas.
 *
 * Fica aqui, e não no serviço, porque a mesma tabela responde duas perguntas
 * em lugares diferentes: a tela precisa saber quais botões oferecer, e a API
 * precisa saber o que recusar. Duas cópias divergem — e a que diverge em
 * silêncio é sempre a do servidor, que é justamente a que decide.
 */

export const ESTADOS_DO_PEDIDO = [
  /** Nasce aqui. É o que a mensagem ao tutor chama de "em análise". */
  'EM_ANALISE',
  'EM_PRODUCAO',
  'PRONTO',
  'ENTREGUE',
  'CANCELADO',
] as const;

export type EstadoDoPedido = (typeof ESTADOS_DO_PEDIDO)[number];

/**
 * Para onde vai a encomenda.
 *
 * A escolha é de quem envia, e fica congelada no pedido junto com o endereço
 * daquele dia.
 */
export const DESTINOS = ['CLINICA', 'TUTOR'] as const;
export type DestinoDaEntrega = (typeof DESTINOS)[number];

/**
 * O que pode virar o quê.
 *
 * `ENTREGUE` e `CANCELADO` não levam a lugar nenhum, e é de propósito: o
 * remédio já saiu, ou já não sai. Um pedido que volta de entregue para em
 * produção é um histórico que mente sobre o que aconteceu — e o histórico é o
 * que sobra quando alguém pergunta, meses depois, o que houve com aquele
 * controlado.
 */
const TRANSICOES: Readonly<Record<EstadoDoPedido, readonly EstadoDoPedido[]>> = {
  EM_ANALISE: ['EM_PRODUCAO', 'CANCELADO'],
  EM_PRODUCAO: ['PRONTO', 'CANCELADO'],
  PRONTO: ['ENTREGUE', 'CANCELADO'],
  ENTREGUE: [],
  CANCELADO: [],
};

/** Se o pedido ainda anda. Estado final responde `false`. */
export function pedidoEmAberto(estado: EstadoDoPedido): boolean {
  return TRANSICOES[estado].length > 0;
}

/** Os estados para os quais este pedido pode ir agora. */
export function proximosEstados(de: EstadoDoPedido): readonly EstadoDoPedido[] {
  return TRANSICOES[de];
}

export function transicaoPermitida(de: EstadoDoPedido, para: EstadoDoPedido): boolean {
  return TRANSICOES[de].includes(para);
}

const ROTULOS: Record<EstadoDoPedido, string> = {
  EM_ANALISE: 'Em análise',
  EM_PRODUCAO: 'Em produção',
  PRONTO: 'Pronto',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

export function rotuloDoEstado(estado: EstadoDoPedido): string {
  return ROTULOS[estado];
}

/**
 * O que o tutor lê sobre o próprio pedido.
 *
 * Escrito para quem espera em casa, não para quem opera a bancada: diz o que
 * está acontecendo e o que vem a seguir, porque a pergunta por trás de abrir o
 * link é sempre "quando chega".
 */
const PARA_O_TUTOR: Record<EstadoDoPedido, string> = {
  EM_ANALISE: 'Seu pedido está em análise. A equipe entrará em contato em breve.',
  EM_PRODUCAO: 'A farmácia está manipulando o seu pedido.',
  PRONTO: 'Seu pedido está pronto. A farmácia vai combinar a entrega.',
  ENTREGUE: 'Pedido entregue.',
  CANCELADO: 'Este pedido foi cancelado. Fale com a clínica se não foi você que pediu.',
};

export function descreverParaOTutor(estado: EstadoDoPedido): string {
  return PARA_O_TUTOR[estado];
}
