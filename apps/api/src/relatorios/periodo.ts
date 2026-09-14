/**
 * O mês do relatório, como intervalo.
 *
 * Função pura, e num arquivo só, porque é o tipo de código que parece trivial
 * e erra em silêncio: mês fora de 1–12, fevereiro, e principalmente o fim do
 * intervalo. `new Date(ano, mes, 0)` dá o último dia do mês anterior ao
 * índice — que é o último dia do mês pedido — mas à meia-noite, e usar isso
 * como limite superior perde o dia inteiro.
 *
 * Aqui o fim é o **início do mês seguinte**, e a comparação é exclusiva
 * (`lt`). Não há "23:59:59.999" a acertar, e nada cai na fresta entre o
 * último milissegundo e a virada.
 */
export type Periodo = { inicio: Date; fim: Date; rotulo: string };

/** `2026-09` → setembro de 2026. Sem argumento, o mês corrente. */
export function periodoDoMes(mes?: string): Periodo {
  const agora = new Date();
  let ano = agora.getFullYear();
  let numero = agora.getMonth() + 1;

  // Vazio conta como ausente: é o que o seletor de mês manda quando a pessoa
  // limpa o campo, e recusar ali seria erro vermelho sobre campo em branco.
  if (mes) {
    const casou = /^(\d{4})-(\d{2})$/.exec(mes);
    if (!casou) throw new RangeError('O mês precisa vir como AAAA-MM.');

    ano = Number(casou[1]);
    numero = Number(casou[2]);

    if (numero < 1 || numero > 12) throw new RangeError('Mês fora de 1 a 12.');
    // Antes do sistema existir não há o que relatar, e ano de quatro dígitos
    // com 0 na frente costuma ser dedo trocado, não pedido.
    if (ano < 2000 || ano > 9999) throw new RangeError('Ano fora de 2000 a 9999.');
  }

  return {
    inicio: new Date(ano, numero - 1, 1),
    fim: new Date(ano, numero, 1),
    rotulo: `${ano}-${String(numero).padStart(2, '0')}`,
  };
}
