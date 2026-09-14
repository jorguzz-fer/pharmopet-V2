import { Icone } from '@/componentes/Icone';

const PASSOS = ['Tutor', 'Paciente', 'Prescrição', 'Revisão'] as const;

export type EscolhasDaReceita = {
  /** Quem é o tutor, depois do passo 1. */
  tutor?: string;
  /** Qual é o animal, depois do passo 2. */
  paciente?: string;
};

export type PropsDosPassos = {
  atual: 1 | 2 | 3 | 4;
  /**
   * O que já foi escolhido em cada passo concluído.
   *
   * O trilho antes só dizia "Tutor ✓". Quem volta de uma busca, de uma ligação
   * ou de outra aba precisa saber **qual** tutor — e a alternativa era descer
   * até o corpo da página para conferir, ou voltar um passo e perder o que já
   * havia preenchido.
   */
  escolhas?: EscolhasDaReceita;
  /** Volta a um passo concluído. Sem isso, o trilho é só um mostrador. */
  aoVoltar?: (passo: 1 | 2) => void;
};

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
export function PassosDaReceita({ atual, escolhas, aoVoltar }: PropsDosPassos) {
  const escolhido = [escolhas?.tutor, escolhas?.paciente] as const;

  return (
    <ol className="grid gap-x-2 gap-y-3 sm:grid-cols-4" aria-label="Passos da receita">
      {PASSOS.map((rotulo, indice) => {
        const numero = (indice + 1) as 1 | 2 | 3 | 4;
        const feito = numero < atual;
        const aqui = numero === atual;
        const valor = feito ? escolhido[indice] : undefined;
        // Só os dois primeiros têm para onde voltar: o terceiro é onde se está,
        // e o quarto ainda não existe.
        const clicavel = feito && numero <= 2 && aoVoltar !== undefined;

        const conteudo = (
          <>
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={[
                  'flex size-6 shrink-0 items-center justify-center rounded-pill text-xs font-bold',
                  aqui
                    ? 'border-2 border-turquesa-700 bg-neutro-0 text-turquesa-700'
                    : feito
                      ? 'bg-turquesa-700 text-neutro-0'
                      : 'border border-neutro-500 text-neutro-500',
                ].join(' ')}
              >
                {feito ? <Icone nome="confere" tamanho={14} /> : numero}
              </span>
              <span
                className={[
                  'text-micro font-bold tracking-wider uppercase',
                  feito || aqui ? 'text-turquesa-700' : 'text-neutro-500',
                ].join(' ')}
              >
                {numero} · {rotulo}
              </span>
            </span>
            {/* A linha do valor existe sempre, mesmo vazia: sem ela os quatro
                passos mudam de altura conforme o preenchimento, e a página
                pula a cada avanço. */}
            <span
              className={[
                'block min-h-5 truncate pl-8 text-sm',
                valor ? 'font-semibold text-neutro-900' : 'text-neutro-500',
              ].join(' ')}
            >
              {valor ?? (aqui ? 'Em andamento' : '')}
            </span>
          </>
        );

        return (
          <li
            key={rotulo}
            // `aria-current="step"` é o que faz o leitor de tela anunciar qual
            // dos quatro está aberto; a cor sozinha não diz nada a quem não
            // enxerga.
            aria-current={aqui ? 'step' : undefined}
            className="flex flex-col"
          >
            <span className="sr-only">{`Passo ${numero} de 4: `}</span>
            {clicavel ? (
              <button
                type="button"
                onClick={() => aoVoltar(numero as 1 | 2)}
                className="flex flex-col gap-1 rounded-controle py-1 text-left transition-colors hover:bg-neutro-100"
              >
                {conteudo}
              </button>
            ) : (
              <span className="flex flex-col gap-1 py-1">{conteudo}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
