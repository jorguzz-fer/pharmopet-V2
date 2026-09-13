import type { Papel, Prisma } from '@prisma/client';

/**
 * Quem enxerga o quê.
 *
 * A ADR 0011 escopava por autor, porque não havia clínica para escopar. A ADR
 * 0012 trouxe clínica, e o eixo mudou:
 *
 * - **Ficha com clínica é da clínica.** Todos que atendem nela a enxergam —
 *   dois veterinários do mesmo lugar atendem o mesmo tutor, e obrigá-los a
 *   cadastrar duas vezes era o incômodo que a 0011 aceitava por não ter saída.
 * - **Ficha sem clínica é de quem cadastrou.** É o caso do profissional
 *   autônomo, e vale a regra antiga.
 * - **ADMIN e FARMACIA veem tudo**, porque precisam: uma manipula e entrega, a
 *   outra administra.
 *
 * Fora do escopo responde 404, nunca 403: "existe, mas não é seu" já confirma
 * o registro para quem está sondando uma carteira de clientes.
 */
export type Ator = { id: string; papel: Papel };

export function veTudo(ator: Ator): boolean {
  return ator.papel === 'ADMIN' || ator.papel === 'FARMACIA';
}

/**
 * Filtro do tutor. `{}` para quem vê tudo.
 *
 * `clinicasDoAtor` são os vínculos ativos de quem está perguntando. Vem de
 * fora porque exige ida ao banco, e este módulo é só a regra — mantê-lo puro é
 * o que permite testá-lo sem Postgres.
 */
export function escopoDeTutor(
  ator: Ator,
  clinicasDoAtor: readonly string[],
): Prisma.TutorWhereInput {
  if (veTudo(ator)) return {};

  return {
    OR: [
      { cadastradoPorId: ator.id },
      ...(clinicasDoAtor.length > 0 ? [{ clinicaId: { in: [...clinicasDoAtor] } }] : []),
    ],
  };
}

export function escopoDePaciente(
  ator: Ator,
  clinicasDoAtor: readonly string[],
): Prisma.PacienteWhereInput {
  if (veTudo(ator)) return {};

  return { tutor: escopoDeTutor(ator, clinicasDoAtor) };
}

/**
 * Filtro da receita.
 *
 * Quem tem papel CLINICA vê as receitas emitidas na clínica dele — e só elas,
 * nem mesmo as que ele próprio tenha criado fora dali, porque não cria. Quem
 * prescreve vê as suas e as da clínica onde atende.
 */
export function escopoDeReceita(
  ator: Ator,
  clinicasDoAtor: readonly string[],
): Prisma.ReceitaWhereInput {
  if (veTudo(ator)) return {};

  const daClinica = clinicasDoAtor.length > 0 ? [{ clinicaId: { in: [...clinicasDoAtor] } }] : [];

  if (ator.papel === 'CLINICA') {
    // Sem vínculo, não vê nada. `{ id: { in: [] } }` é uma condição que nunca
    // casa — melhor do que `{}`, que devolveria tudo.
    return daClinica.length > 0 ? { OR: daClinica } : { id: { in: [] } };
  }

  return { OR: [{ veterinarioId: ator.id }, ...daClinica] };
}
