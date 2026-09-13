import { useId } from 'react';
import { rotuloDoPapel } from '@/sessao/papeis';

/**
 * Os quatro papéis, na ordem em que a instalação os usa.
 *
 * Lista aqui e não derivada do contrato porque a ordem é editorial — o
 * veterinário vem primeiro porque é quem mais se cadastra — e porque cada um
 * ganha uma linha de explicação. Se o contrato ganhar um papel, o compilador
 * aponta `rotuloDoPapel`, que é `Record<Papel, string>`.
 */
export const PAPEIS = ['VETERINARIO', 'CLINICA', 'FARMACIA', 'ADMIN'] as const;

const EXPLICACAO: Record<(typeof PAPEIS)[number], string> = {
  VETERINARIO: 'Prescreve, emite e cancela receita. Só ele assina.',
  CLINICA: 'Lê a clientela e as receitas da clínica, e não prescreve.',
  FARMACIA: 'Trabalha a fila de pedidos e vê a composição do preço.',
  ADMIN: 'Administra a instalação: catálogo, clínicas e esta lista.',
};

export function SeletorDePapel({
  valor,
  aoMudar,
}: {
  valor: (typeof PAPEIS)[number];
  aoMudar: (papel: (typeof PAPEIS)[number]) => void;
}) {
  const id = useId();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-neutro-900">Papel</legend>
      {/* Rádio e não um `select`: são quatro opções com consequência diferente,
          e a explicação de cada uma precisa estar visível na hora de escolher —
          num `select` ela só apareceria depois de escolhido. */}
      {PAPEIS.map((papel) => (
        <label
          key={papel}
          htmlFor={`${id}-${papel}`}
          className="flex min-h-[var(--altura-controle)] cursor-pointer items-start gap-3 rounded-controle border border-neutro-200 px-3 py-2 hover:bg-neutro-100"
        >
          <input
            id={`${id}-${papel}`}
            type="radio"
            name={id}
            className="mt-1"
            checked={valor === papel}
            onChange={() => aoMudar(papel)}
          />
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-neutro-900">{rotuloDoPapel[papel]}</span>
            <span className="text-sm text-neutro-500">{EXPLICACAO[papel]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
