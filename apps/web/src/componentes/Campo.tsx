import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export type PropsDoCampo = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  rotulo: string;
  /** Texto de apoio sob o campo. Some quando há erro, para não competir. */
  ajuda?: ReactNode;
  erro?: string;
};

/**
 * Campo de texto com rótulo, ajuda e erro amarrados por id.
 *
 * O amarrado não é detalhe: sem `htmlFor` o leitor de tela anuncia o campo sem
 * nome, e sem `aria-describedby` a mensagem de erro simplesmente não é lida.
 * Deixar isso a cargo de cada tela garante que uma delas vai esquecer.
 */
export function Campo({ rotulo, ajuda, erro, className = '', ...resto }: PropsDoCampo) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;
  const descrito = [erro ? idErro : null, ajuda && !erro ? idAjuda : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-neutro-700">
        {rotulo}
      </label>

      <input
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descrito || undefined}
        className={[
          'min-h-[var(--altura-controle)] w-full rounded-controle bg-neutro-0 px-3',
          'text-base text-neutro-900 placeholder:text-neutro-500',
          'border',
          erro ? 'border-controlado-base' : 'border-neutro-200',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...resto}
      />

      {erro ? (
        // `role="alert"` para a correção chegar a quem não está olhando o campo.
        <p id={idErro} role="alert" className="text-xs text-controlado-texto">
          {erro}
        </p>
      ) : ajuda ? (
        <p id={idAjuda} className="text-xs text-neutro-500">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}
