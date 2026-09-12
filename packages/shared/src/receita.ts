/**
 * Regras da receita: prazo de validade e situação.
 *
 * Receita não é um formulário — é documento. Duas consequências moram aqui:
 *
 *   1. Ela vence. E o prazo não é escolha da farmácia: depende da lista de
 *      controle do que foi prescrito, e vale o mais curto entre os itens.
 *   2. Depois de emitida, não se corrige. Corrigir documento emitido é
 *      reescrever o passado; o caminho é cancelar e emitir outra.
 *
 * Os prazos abaixo são a leitura da Portaria SVS/MS 344/98 (art. 35, 38 e 41) e
 * da RDC 471/2021 para antimicrobianos. Estão em código, e não em cadastro, de
 * propósito: mudança de prazo legal precisa passar por revisão e ficar no
 * histórico do repositório, e não ser um campo que alguém edita numa tela.
 */

/** Listas da Portaria 344/98 com prazo que o sistema conhece, em dias. */
const PRAZO_POR_LISTA: Readonly<Record<string, number>> = {
  // Notificação de Receita A (amarela) — entorpecentes.
  A1: 30,
  A2: 30,
  A3: 30,
  // Notificação de Receita B (azul) — psicotrópicos.
  B1: 30,
  B2: 30,
  // Receita de Controle Especial, em duas vias.
  C1: 30,
  C2: 30,
  C5: 30,
  // Antimicrobianos, RDC 471/2021.
  ANTIMICROBIANO: 10,
};

/**
 * Prazo de quem não é controlado.
 *
 * A lei não fixa validade para receita comum. Este número é política de
 * operação, não norma: existe para a farmácia não manipular, sem perguntar
 * nada, uma receita de um ano atrás — o peso do animal mudou, e a dose que era
 * certa deixou de ser.
 */
export const PRAZO_PADRAO_EM_DIAS = 180;

export type PrazoDaReceita =
  | { tipo: 'definido'; dias: number; motivo: string }
  /**
   * Apareceu uma lista de controle que o sistema não conhece. Não cair no prazo
   * padrão é o ponto: o padrão é seis meses, e chutar seis meses para um
   * entorpecente seria o erro mais caro que este módulo pode cometer.
   */
  | { tipo: 'lista-desconhecida'; lista: string };

/**
 * O prazo da receita inteira: o mais curto entre os itens.
 *
 * Uma receita com um antimicrobiano e um ansiolítico vence em dez dias, e não
 * em trinta — a folha é uma só, e vale enquanto todos os itens valerem.
 */
export function prazoDaReceita(listasDeControle: readonly (string | null)[]): PrazoDaReceita {
  let dias = PRAZO_PADRAO_EM_DIAS;
  let motivo = 'Receita comum: prazo de operação da farmácia.';

  for (const bruta of listasDeControle) {
    const lista = bruta?.trim().toUpperCase();
    if (!lista) continue;

    const prazo = PRAZO_POR_LISTA[lista];
    if (prazo === undefined) return { tipo: 'lista-desconhecida', lista };

    if (prazo < dias) {
      dias = prazo;
      motivo = `Lista ${lista}: ${prazo} dias a contar da emissão.`;
    }
  }

  return { tipo: 'definido', dias, motivo };
}

/**
 * Quando a receita deixa de valer.
 *
 * Soma dias ao instante da emissão, e não ao dia civil. A diferença é de horas
 * e sempre para o lado mais curto — uma receita emitida às 23h50 vence às 23h50
 * do trigésimo dia, e não na virada seguinte. Encurtar por horas é aceitável;
 * esticar não seria.
 */
export function venceEm(emitidaEm: Date, dias: number): Date {
  const vencimento = new Date(emitidaEm.getTime());
  vencimento.setUTCDate(vencimento.getUTCDate() + dias);

  return vencimento;
}

export type EstadoDaReceita = 'RASCUNHO' | 'EMITIDA' | 'CANCELADA';

/** O que a receita é agora, já contado o relógio. */
export type SituacaoDaReceita = 'rascunho' | 'valida' | 'vencida' | 'cancelada';

export function situacaoDaReceita(
  receita: { estado: EstadoDaReceita; validaAte: Date | null },
  agora: Date = new Date(),
): SituacaoDaReceita {
  switch (receita.estado) {
    case 'RASCUNHO':
      return 'rascunho';
    case 'CANCELADA':
      return 'cancelada';
    case 'EMITIDA':
      // Emitida sem prazo não existe; se existir, é dado corrompido, e tratar
      // como válida seria deixar passar uma receita sem vencimento.
      if (receita.validaAte === null) return 'vencida';
      return agora.getTime() <= receita.validaAte.getTime() ? 'valida' : 'vencida';
  }
}

/** Só receita válida pode virar manipulação. */
export function podeSerAtendida(
  receita: { estado: EstadoDaReceita; validaAte: Date | null },
  agora: Date = new Date(),
): boolean {
  return situacaoDaReceita(receita, agora) === 'valida';
}

/** Frase pronta para a tela. `null` quando não há nada a avisar. */
export function descreverSituacao(situacao: SituacaoDaReceita): string | null {
  switch (situacao) {
    case 'valida':
      return null;
    case 'rascunho':
      return 'Esta receita ainda é um rascunho e não foi emitida.';
    case 'vencida':
      return 'Esta receita venceu. Emita uma nova para que a farmácia possa manipular.';
    case 'cancelada':
      return 'Esta receita foi cancelada.';
  }
}
