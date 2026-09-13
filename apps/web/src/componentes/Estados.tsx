import type { ReactNode } from 'react';
import { Botao } from '@/componentes/Botao';

/**
 * Os três estados de uma tela que carrega dados.
 *
 * Ficam juntos num arquivo porque são a mesma decisão: se cada tela escrever o
 * seu "carregando", metade vai esquecer o `aria-live` e a outra metade vai
 * confundir lista vazia com resposta ainda a caminho.
 */

export function Carregando({ o = 'dados' }: { o?: string }) {
  return (
    // `polite` e não `assertive`: o leitor de tela avisa quando terminar a
    // frase atual, em vez de cortar quem está lendo outra coisa.
    <p aria-live="polite" className="py-8 text-center text-sm text-neutro-500">
      Carregando {o}…
    </p>
  );
}

export function Falha({ motivo, aoTentar }: { motivo: string; aoTentar?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-controle border border-controlado-borda bg-controlado-fundo px-4 py-3"
    >
      <p className="text-sm text-controlado-texto">{motivo}</p>
      {aoTentar ? (
        <Botao tom="secundario" onClick={aoTentar}>
          Tentar de novo
        </Botao>
      ) : null}
    </div>
  );
}

/**
 * Lista sem resultado.
 *
 * Diz o que fazer, e não só que não há nada: "nenhum tutor" deixa a pessoa
 * parada, "nenhum tutor com esse nome — cadastre" não.
 */
export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-neutro-500">{children}</p>;
}
