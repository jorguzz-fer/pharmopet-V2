/**
 * Peso: quilo na tela, grama no sistema.
 *
 * O veterinário pesa em quilo e escreve "12,5". A faixa terapêutica, a dose e
 * o banco falam em grama inteiro — meio quilo de calopsita não deveria virar
 * `0.5` flutuante no meio de um cálculo de dose.
 *
 * A conversão mora aqui, num lugar só e testada, porque errar a escala é o
 * erro mais caro desta tela: 12 digitados onde se esperava grama viraria uma
 * dose mil vezes menor, e o número continuaria parecendo plausível.
 */

/** Dois mil quilos: cobre o maior equino que uma farmácia magistral atende. */
export const PESO_MAXIMO_EM_GRAMAS = 2_000_000;

export type PesoInformado = { valido: true; emGramas: number } | { valido: false; motivo: string };

/**
 * Lê o que a pessoa digitou como quilos e devolve gramas inteiros.
 *
 * Aceita vírgula e ponto: o teclado do celular oferece um, o do computador
 * oferece outro, e recusar qualquer um dos dois seria implicância com quem
 * está com o animal na mesa.
 */
export function lerPesoEmQuilos(bruto: string): PesoInformado {
  const texto = bruto.trim().replace(',', '.');

  if (texto === '') return { valido: false, motivo: 'Informe o peso.' };

  // Barra notação científica, sinal e qualquer coisa que não seja um decimal
  // simples. `Number('1e3')` daria 1000 sem reclamar.
  if (!/^\d+(\.\d+)?$/.test(texto)) {
    return { valido: false, motivo: 'Use apenas números, com vírgula para os gramas.' };
  }

  const emQuilos = Number(texto);
  if (emQuilos <= 0) return { valido: false, motivo: 'O peso precisa ser maior que zero.' };

  // Multiplica e arredonda: 12.5 × 1000 dá 12500.000000000002 em ponto
  // flutuante, e truncar devolveria 12499.
  const emGramas = Math.round(emQuilos * 1000);

  if (emGramas > PESO_MAXIMO_EM_GRAMAS) {
    return { valido: false, motivo: 'Peso acima do que a farmácia atende — confira a unidade.' };
  }

  // Abaixo de um grama a balança da clínica não chega, e o mais provável é
  // alguém ter digitado grama no campo de quilo.
  if (emGramas < 1) return { valido: false, motivo: 'Peso abaixo de um grama — confira.' };

  return { valido: true, emGramas };
}

/**
 * Gramas como a pessoa lê.
 *
 * Abaixo de um quilo mostra em grama: "450 g" é o que se diz de um filhote ou
 * de uma ave, e "0,45 kg" obrigaria a conversão mental na hora de conferir.
 */
export function formatarPeso(emGramas: number): string {
  if (emGramas < 1000) return `${emGramas} g`;

  // Mínimo zero e máximo três: 30 kg não vira "30,000", e 12,53 kg não perde
  // os trinta gramas. O `Intl` decide quantas casas mostrar melhor do que
  // qualquer regra escrita à mão aqui.
  return `${(emGramas / 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })} kg`;
}

/** Gramas no campo de edição, em quilo, sem unidade: 12500 → "12,5". */
export function pesoParaCampo(emGramas: number): string {
  return String(emGramas / 1000).replace('.', ',');
}
