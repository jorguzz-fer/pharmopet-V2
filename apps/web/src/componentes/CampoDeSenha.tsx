import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';

export type PropsDoCampoDeSenha = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  rotulo: string;
  ajuda?: ReactNode;
  erro?: string;
};

/**
 * Campo de senha com o olho de mostrar e esconder.
 *
 * Existe porque a senha desta aplicação é digitada em pé, num balcão, e num
 * teclado de celular que corrige sozinho. Sem poder conferir o que digitou, a
 * pessoa erra, erra de novo, e na quinta a conta bloqueia por meia hora — o
 * bloqueio progressivo da fase 2 não distingue quem ataca de quem tem dedo
 * gordo. O olho troca um risco por outro, e o que ele evita é maior.
 *
 * Nasce escondido, sempre: quem precisa ver clica. Começar visível exporia a
 * senha de quem só quer entrar rápido, que é a maioria.
 *
 * Separado do `Campo` e não um `type="password"` dele porque o olho traz estado
 * e um botão dentro do campo — coisas que todo campo de texto passaria a
 * carregar sem usar.
 */
export function CampoDeSenha({
  rotulo,
  ajuda,
  erro,
  className = '',
  ...resto
}: PropsDoCampoDeSenha) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;
  const [visivel, setVisivel] = useState(false);
  const descrito = [erro ? idErro : null, ajuda && !erro ? idAjuda : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-neutro-700">
        {rotulo}
      </label>

      <div className="relative">
        <input
          id={id}
          type={visivel ? 'text' : 'password'}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descrito || undefined}
          className={[
            'min-h-[var(--altura-controle)] w-full rounded-controle bg-neutro-0 pl-3',
            // Espaço à direita para o botão não cobrir o que está sendo digitado.
            'pr-12',
            'text-base text-neutro-900 placeholder:text-neutro-500',
            'border',
            erro ? 'border-controlado-base' : 'border-neutro-200',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...resto}
        />

        {/*
          `type="button"` porque este campo vive dentro de um `form`, e o padrão
          de um botão lá dentro é `submit`: sem isto, clicar no olho tentaria
          entrar com a senha pela metade.

          O rótulo muda junto com o estado em vez de usar `aria-pressed`: "Mostrar
          senha" e "Ocultar senha" dizem o que o clique faz, que é o que se quer
          ouvir antes de clicar.
        */}
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-controle text-neutro-500 hover:text-neutro-900 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Olho aberto={visivel} />
        </button>
      </div>

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

/**
 * O olho, aberto ou riscado.
 *
 * `aria-hidden` porque quem não enxerga já recebe o `aria-label` do botão —
 * anunciar o desenho também faria o leitor de tela dizer a mesma coisa duas
 * vezes. `currentColor` para o ícone seguir o estado de foco e hover do botão
 * sem uma segunda regra de cor.
 */
function Olho({ aberto }: { aberto: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {/* A barra só aparece quando a senha está visível: ela diz o que o clique
          faria — esconder —, e não o estado atual. */}
      {aberto ? <path d="M4 20 20 4" /> : null}
    </svg>
  );
}
