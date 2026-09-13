import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

export type PropsDaAreaDeTexto = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  rotulo: string;
  /** Texto de apoio sob o campo. Some quando há erro, para não competir. */
  ajuda?: ReactNode;
  erro?: string;
};

/**
 * Campo de várias linhas.
 *
 * Gêmeo do `Campo`, e existe pelo mesmo motivo: sem `htmlFor` o leitor de tela
 * anuncia a caixa sem nome, e sem `aria-describedby` a mensagem de erro não é
 * lida. Duplicar a amarração em cada tela garante que uma delas vai esquecer.
 */
export function AreaDeTexto({ rotulo, ajuda, erro, className = '', ...resto }: PropsDaAreaDeTexto) {
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

      <textarea
        id={id}
        rows={3}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descrito || undefined}
        className={[
          'w-full rounded-controle bg-neutro-0 px-3 py-2',
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
