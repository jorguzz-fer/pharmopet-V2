import type { Papel } from '@prisma/client';

/**
 * Quem enxerga o quê.
 *
 * Uma instalação só, vários veterinários, e a clientela de cada um é dele. Se
 * qualquer veterinário pudesse listar todos os tutores, a lista de clientes de
 * um seria visível ao outro — que é informação comercial, e é também dado
 * pessoal de terceiro. Quem opera a farmácia vê tudo, porque precisa: é quem
 * manipula e quem entrega.
 *
 * O efeito é de leitura *e* de escrita: alterar a ficha de um tutor que não é
 * seu falha do mesmo jeito que lê-la.
 */
export type Ator = { id: string; papel: Papel };

export function veTudo(ator: Ator): boolean {
  return ator.papel === 'ADMIN' || ator.papel === 'FARMACIA';
}

/**
 * Filtro do tutor. `{}` para quem vê tudo.
 *
 * O caminho do paciente e o da receita passam por aqui de propósito: uma regra
 * de visibilidade repetida em três lugares vira três regras na primeira vez que
 * alguém alterar uma delas.
 */
export function escopoDeTutor(ator: Ator): { cadastradoPorId?: string } {
  return veTudo(ator) ? {} : { cadastradoPorId: ator.id };
}

export function escopoDePaciente(ator: Ator): { tutor?: { cadastradoPorId: string } } {
  return veTudo(ator) ? {} : { tutor: { cadastradoPorId: ator.id } };
}

export function escopoDeReceita(ator: Ator): { veterinarioId?: string } {
  return veTudo(ator) ? {} : { veterinarioId: ator.id };
}
