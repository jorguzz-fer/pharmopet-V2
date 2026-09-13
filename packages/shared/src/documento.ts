/**
 * CPF e telefone: normalização e conferência.
 *
 * Ficam aqui, e não num validador do banco, porque a mesma regra precisa valer
 * na tela antes de enviar e na API antes de gravar. Um CPF com dígito errado é
 * erro de digitação, não preferência de quem cadastra — e descobrir isso três
 * meses depois, quando a receita precisa do documento do tutor, sai caro.
 */

/** Só os dígitos. Máscara de tela não é dado. */
export function apenasDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/**
 * Confere os dois dígitos verificadores do CPF.
 *
 * Recebe com ou sem máscara. Não diz nada sobre a pessoa existir na Receita
 * Federal — só que o número é internamente consistente, que é o que pega o
 * dedo trocado na digitação.
 */
export function cpfValido(bruto: string): boolean {
  const digitos = apenasDigitos(bruto);
  if (digitos.length !== 11) return false;

  // 000.000.000-00 e os outros dez repetidos passam na aritmética dos dígitos
  // verificadores, então precisam ser barrados à parte.
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  for (const posicao of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < posicao; i += 1) {
      soma += Number(digitos[i]) * (posicao + 1 - i);
    }

    const resto = (soma * 10) % 11;
    // Resto 10 e 11 valem zero — é a regra da Receita, não um caso de borda.
    const esperado = resto >= 10 ? 0 : resto;

    if (esperado !== Number(digitos[posicao])) return false;
  }

  return true;
}

/** `12345678909` vira `123.456.789-09`. Entrada já conferida. */
export function formatarCpf(bruto: string): string {
  const d = apenasDigitos(bruto);
  if (d.length !== 11) return bruto;

  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Telefone brasileiro com DDD, fixo ou celular.
 *
 * Aceita o `55` na frente e descarta: quem digita o país está descrevendo o
 * mesmo número. Não aceita número sem DDD — a farmácia liga de outro estado, e
 * um telefone sem DDD é um telefone que ninguém consegue usar.
 */
export function telefoneValido(bruto: string): boolean {
  return normalizarTelefone(bruto) !== null;
}

/** Devolve os dígitos sem o código do país, ou `null` se o número não servir. */
export function normalizarTelefone(bruto: string): string | null {
  let digitos = apenasDigitos(bruto);

  if (digitos.length > 11 && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }

  if (digitos.length !== 10 && digitos.length !== 11) return null;

  // DDD válido começa em 11. Não existe DDD 00 a 10.
  const ddd = Number(digitos.slice(0, 2));
  if (ddd < 11) return null;

  // Celular tem nove dígitos e o primeiro é 9; fixo tem oito e começa em 2..5.
  const assinante = digitos.slice(2);
  if (assinante.length === 9 && !assinante.startsWith('9')) return null;
  if (assinante.length === 8 && !/^[2-5]/.test(assinante)) return null;

  return digitos;
}

/** `11987654321` vira `(11) 98765-4321`. */
export function formatarTelefone(bruto: string): string {
  const digitos = normalizarTelefone(bruto);
  if (digitos === null) return bruto;

  const ddd = digitos.slice(0, 2);
  const assinante = digitos.slice(2);
  const corte = assinante.length === 9 ? 5 : 4;

  return `(${ddd}) ${assinante.slice(0, corte)}-${assinante.slice(corte)}`;
}

/**
 * Confere os dois dígitos verificadores do CNPJ.
 *
 * Mesma ideia do CPF, com pesos diferentes: a sequência de multiplicadores vai
 * de 2 a 9 e reinicia, em vez de contar para trás. Não diz que a empresa
 * existe — diz que o número é internamente consistente, que é o que pega o
 * dígito trocado na digitação.
 */
export function cnpjValido(bruto: string): boolean {
  const digitos = apenasDigitos(bruto);
  if (digitos.length !== 14) return false;

  // Os quatorze repetidos fecham a aritmética, como no CPF.
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  for (const posicao of [12, 13]) {
    let soma = 0;
    let peso = posicao - 7;

    for (let i = 0; i < posicao; i += 1) {
      soma += Number(digitos[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }

    const resto = soma % 11;
    const esperado = resto < 2 ? 0 : 11 - resto;

    if (esperado !== Number(digitos[posicao])) return false;
  }

  return true;
}

/** `11222333000181` vira `11.222.333/0001-81`. */
export function formatarCnpj(bruto: string): string {
  const d = apenasDigitos(bruto);
  if (d.length !== 14) return bruto;

  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
