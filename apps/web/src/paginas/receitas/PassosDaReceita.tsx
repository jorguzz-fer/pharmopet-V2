const PASSOS = ['Tutor', 'Paciente', 'Prescrição', 'Revisão'] as const;

/**
 * Onde a receita está, dos quatro passos.
 *
 * Os quatro são os da v1, e o quarto é real: a revisão é a tela da receita
 * (`/receitas/:id`), onde se confere e se emite. Ele aparece apagado durante
 * a montagem porque saber que ainda vem uma conferência muda o que a pessoa
 * faz agora — sem isso, cada campo é preenchido como se fosse definitivo.
 *
 * `<ol>` de verdade, e não uma fileira de `div`s: é uma sequência, e quem usa
 * leitor de tela precisa ouvir "2 de 4" em algum lugar.
 */
export function PassosDaReceita({ atual }: { atual: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Passos da receita">
      {PASSOS.map((rotulo, indice) => {
        const numero = indice + 1;
        const feito = numero < atual;
        const aqui = numero === atual;

        return (
          <li key={rotulo} className="flex items-center gap-2">
            <span
              // `aria-current="step"` é o que faz o leitor de tela anunciar
              // qual dos quatro está aberto; a cor sozinha não diz nada a
              // quem não enxerga.
              aria-current={aqui ? 'step' : undefined}
              className={[
                'flex items-center gap-2 rounded-controle px-3 py-1.5 text-sm',
                aqui
                  ? 'bg-turquesa-700 font-semibold text-neutro-0'
                  : feito
                    ? 'bg-turquesa-50 font-semibold text-turquesa-700'
                    : 'text-neutro-500',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  aqui
                    ? 'bg-neutro-0 text-turquesa-700'
                    : feito
                      ? 'bg-turquesa-700 text-neutro-0'
                      : 'border border-neutro-300 text-neutro-500',
                ].join(' ')}
                aria-hidden="true"
              >
                {feito ? '✓' : numero}
              </span>
              <span className="sr-only">{`Passo ${numero} de 4: `}</span>
              {rotulo}
            </span>
            {numero < PASSOS.length ? (
              <span aria-hidden="true" className="text-neutro-300">
                ›
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
