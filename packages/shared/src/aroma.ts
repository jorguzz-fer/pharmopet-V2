/**
 * Os sabores das formas que o animal come.
 *
 * A lista é a que o cliente fechou, e ele disse "esses quatro por enquanto".
 * Fica em código, e não em cadastro, porque cada sabor é insumo que a farmácia
 * precisa ter em estoque — não é um campo que alguém inventa numa tela.
 *
 * A ordem é a da conversa, não alfabética: carne e frango são o que a maioria
 * dos cães e gatos aceita, e vêm primeiro na lista por isso.
 */
export const AROMAS = ['CARNE', 'FRANGO', 'BANANA', 'MORANGO'] as const;

export type Aroma = (typeof AROMAS)[number];

const ROTULOS: Record<Aroma, string> = {
  CARNE: 'Carne',
  FRANGO: 'Frango',
  BANANA: 'Banana',
  MORANGO: 'Morango',
};

/**
 * O sabor como se escreve num documento.
 *
 * `Record` completo de propósito: acrescentar um sabor ao enum sem escrever o
 * rótulo quebra a compilação, em vez de imprimir "MORANGO" na receita que o
 * tutor guarda.
 */
export function rotuloDoAroma(aroma: Aroma): string {
  return ROTULOS[aroma];
}
