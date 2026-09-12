import { z } from 'zod';

/**
 * Conferência da dose contra a faixa terapêutica.
 *
 * É a verificação que o sistema existe para fazer. A dose de um princípio ativo
 * se dá em miligramas por quilo de peso, e a faixa varia por espécie: gato não
 * é cachorro pequeno — metaboliza diferente, e para alguns ativos a diferença é
 * entre tratar e envenenar.
 *
 * O resultado nunca bloqueia por conta própria. Quem responde pela prescrição é
 * o veterinário, que pode ter motivo para sair da faixa — mas precisa saber que
 * saiu, e o quanto.
 */

export const especieSchema = z.enum(['CANINO', 'FELINO', 'EQUINO', 'AVE', 'ROEDOR', 'REPTIL']);
export type Especie = z.infer<typeof especieSchema>;

/** Uma linha do cadastro: a faixa de um ativo, para uma espécie e uma faixa de peso. */
export type FaixaTerapeutica = {
  especie: Especie;
  /** Nulo quando a faixa vale desde o menor peso. */
  pesoMinimoEmGramas: number | null;
  /** Nulo quando a faixa vale até o maior peso. */
  pesoMaximoEmGramas: number | null;
  /** Dose mínima recomendada, em microgramas por quilo. */
  doseMinimaEmMicrogramasPorKg: number;
  /** Dose máxima recomendada, em microgramas por quilo. */
  doseMaximaEmMicrogramasPorKg: number;
  /** Duração máxima recomendada, em dias. Nulo quando não há limite cadastrado. */
  duracaoMaximaEmDias: number | null;
};

export type Paciente = {
  especie: Especie;
  pesoEmGramas: number;
};

export type ConferenciaDeDose =
  /** Não há faixa cadastrada para esta espécie e este peso. */
  | { situacao: 'sem-referencia' }
  | { situacao: 'dentro'; doseEmMicrogramasPorKg: number }
  | {
      situacao: 'abaixo' | 'acima';
      doseEmMicrogramasPorKg: number;
      /** O limite que foi ultrapassado, para a mensagem dizer de quanto. */
      limiteEmMicrogramasPorKg: number;
    };

/**
 * Escolhe a faixa que se aplica ao paciente.
 *
 * Filtra por espécie e por peso. Havendo mais de uma candidata — cadastro com
 * faixas sobrepostas —, fica a mais específica, isto é, a de menor amplitude de
 * peso: uma faixa "2 a 5 kg" foi escrita para aquele porte, e uma "sem limite"
 * é o padrão de quem não encontrou nada melhor.
 */
export function faixaAplicavel(
  faixas: readonly FaixaTerapeutica[],
  paciente: Paciente,
): FaixaTerapeutica | null {
  const candidatas = faixas.filter(
    (f) =>
      f.especie === paciente.especie &&
      (f.pesoMinimoEmGramas === null || paciente.pesoEmGramas >= f.pesoMinimoEmGramas) &&
      (f.pesoMaximoEmGramas === null || paciente.pesoEmGramas <= f.pesoMaximoEmGramas),
  );

  if (candidatas.length === 0) return null;

  const amplitude = (f: FaixaTerapeutica): number =>
    (f.pesoMaximoEmGramas ?? Number.POSITIVE_INFINITY) - (f.pesoMinimoEmGramas ?? 0);

  return candidatas.reduce((melhor, atual) =>
    amplitude(atual) < amplitude(melhor) ? atual : melhor,
  );
}

/**
 * Compara a dose prescrita com a faixa.
 *
 * `doseEmMicrogramas` é a dose por administração, e o peso vem em gramas para
 * a conta ser inteira — meio quilo de calopsita não deveria virar 0,5 flutuante
 * no meio de um cálculo de dose.
 */
export function conferirDose(
  faixas: readonly FaixaTerapeutica[],
  paciente: Paciente,
  doseEmMicrogramas: number,
): ConferenciaDeDose {
  const faixa = faixaAplicavel(faixas, paciente);
  if (!faixa) return { situacao: 'sem-referencia' };

  if (paciente.pesoEmGramas <= 0) return { situacao: 'sem-referencia' };

  // µg por kg = µg × 1000 / gramas. Multiplica antes de dividir para não
  // perder a fração num paciente leve.
  const doseEmMicrogramasPorKg = Math.round((doseEmMicrogramas * 1000) / paciente.pesoEmGramas);

  if (doseEmMicrogramasPorKg < faixa.doseMinimaEmMicrogramasPorKg) {
    return {
      situacao: 'abaixo',
      doseEmMicrogramasPorKg,
      limiteEmMicrogramasPorKg: faixa.doseMinimaEmMicrogramasPorKg,
    };
  }

  if (doseEmMicrogramasPorKg > faixa.doseMaximaEmMicrogramasPorKg) {
    return {
      situacao: 'acima',
      doseEmMicrogramasPorKg,
      limiteEmMicrogramasPorKg: faixa.doseMaximaEmMicrogramasPorKg,
    };
  }

  return { situacao: 'dentro', doseEmMicrogramasPorKg };
}

export type ConferenciaDeDuracao =
  /** Não há faixa aplicável, ou a faixa não traz limite de duração. */
  | { situacao: 'sem-limite' }
  | { situacao: 'dentro'; limiteEmDias: number }
  | { situacao: 'acima'; limiteEmDias: number };

/**
 * Compara a duração do tratamento com o limite da faixa.
 *
 * Dose certa por tempo demais também machuca — corticoide em uso prolongado é
 * o exemplo de manual. O limite só existe quando alguém o cadastrou; sem ele,
 * o silêncio é honesto, e não um "está tudo bem".
 */
export function conferirDuracao(
  faixas: readonly FaixaTerapeutica[],
  paciente: Paciente,
  dias: number,
): ConferenciaDeDuracao {
  const faixa = faixaAplicavel(faixas, paciente);
  if (!faixa || faixa.duracaoMaximaEmDias === null) return { situacao: 'sem-limite' };

  const limiteEmDias = faixa.duracaoMaximaEmDias;

  return dias > limiteEmDias ? { situacao: 'acima', limiteEmDias } : { situacao: 'dentro', limiteEmDias };
}

/** Frase pronta. `null` quando não há o que avisar. */
export function descreverDuracao(
  conferencia: ConferenciaDeDuracao,
  ativo: string,
  dias: number,
): string | null {
  if (conferencia.situacao !== 'acima') return null;

  return `${ativo} está prescrito por ${dias} dias, acima do máximo recomendado de ${conferencia.limiteEmDias}.`;
}

/** µg/kg como mg/kg legível: 2500 → "2,5". */
export function emMgPorKg(microgramasPorKg: number): string {
  return (microgramasPorKg / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

/** Frase pronta para a tela, já com os números. `null` quando não há o que dizer. */
export function descreverConferencia(conferencia: ConferenciaDeDose, ativo: string): string | null {
  switch (conferencia.situacao) {
    case 'sem-referencia':
      return `Não há faixa cadastrada de ${ativo} para esta espécie e peso. Confira a dose.`;
    case 'dentro':
      return null;
    case 'abaixo':
      return `${ativo} está em ${emMgPorKg(conferencia.doseEmMicrogramasPorKg)} mg/kg, abaixo do mínimo de ${emMgPorKg(conferencia.limiteEmMicrogramasPorKg)} mg/kg.`;
    case 'acima':
      return `${ativo} está em ${emMgPorKg(conferencia.doseEmMicrogramasPorKg)} mg/kg, acima do máximo de ${emMgPorKg(conferencia.limiteEmMicrogramasPorKg)} mg/kg.`;
  }
}
