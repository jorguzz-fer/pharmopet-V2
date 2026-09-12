/**
 * Bloqueio progressivo de conta.
 *
 * Lógica pura, fora do serviço, para ser testável sem banco — e para a política
 * ficar num lugar só, legível, em vez de diluída em `if` pelo fluxo de login.
 *
 * A escada é deliberada: as primeiras tentativas não custam nada, porque errar
 * a senha três vezes é humano e travar o veterinário no meio do atendimento é um
 * problema real. A partir da quinta o custo dobra, e em poucas rodadas a espera
 * torna a força bruta inviável sem nunca chegar a um bloqueio permanente — que
 * seria, ele próprio, uma negação de serviço contra a conta.
 */
export const TENTATIVAS_ANTES_DE_BLOQUEAR = 5;

const ESPERA_BASE_SEGUNDOS = 30;
const ESPERA_MAXIMA_SEGUNDOS = 15 * 60;

/**
 * Quanto tempo bloquear depois de `falhas` senhas erradas seguidas.
 *
 * Devolve `null` enquanto ainda não há bloqueio a aplicar.
 */
export function esperaApos(falhas: number): number | null {
  if (falhas < TENTATIVAS_ANTES_DE_BLOQUEAR) return null;

  const excedente = falhas - TENTATIVAS_ANTES_DE_BLOQUEAR;
  const segundos = ESPERA_BASE_SEGUNDOS * 2 ** excedente;

  return Math.min(segundos, ESPERA_MAXIMA_SEGUNDOS);
}

/** Momento em que o bloqueio por `falhas` tentativas termina. */
export function bloqueadoAte(falhas: number, agora: Date): Date | null {
  const segundos = esperaApos(falhas);
  if (segundos === null) return null;

  return new Date(agora.getTime() + segundos * 1000);
}
