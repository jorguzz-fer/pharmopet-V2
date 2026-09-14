import { useState } from 'react';
import { Icone } from '@/componentes/Icone';
import { rotuloDoPapel } from './papeis';
import { useSessao } from './SessaoContexto';

/** Iniciais para o disco. "Maria Silva" → "MS"; "Ana" → "A". */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';

  return (primeira + ultima).toUpperCase();
}

/**
 * Quem está logado, e a saída.
 *
 * Mostra o papel junto do nome porque o que a tela oferece depende dele: sem
 * isso, a pessoa que não vê um botão fica sem saber se ele sumiu, se quebrou,
 * ou se ela simplesmente não tem essa permissão.
 */
export function QuemEsta() {
  const { estado, sair } = useSessao();
  const [saindo, setSaindo] = useState(false);

  if (estado.situacao !== 'dentro') return null;

  const { usuario } = estado;

  return (
    // `min-w-0` no bloco do nome, e `truncate` dentro dele: no rodapé da
    // lateral só há 240px, e um nome longo sem isso empurra o "Sair" para
    // fora da caixa em vez de encurtar.
    <div className="flex w-full items-center gap-3">
      <div
        className="grid size-9 shrink-0 place-items-center rounded-pill bg-lilas-100 text-xs font-bold text-lilas-700"
        aria-hidden="true"
      >
        {iniciais(usuario.nome)}
      </div>

      <div className="hidden min-w-0 flex-1 sm:block">
        <div className="truncate text-sm font-semibold text-neutro-900">{usuario.nome}</div>
        <div className="truncate text-micro text-neutro-500">{rotuloDoPapel[usuario.papel]}</div>
      </div>

      <button
        type="button"
        disabled={saindo}
        onClick={() => {
          setSaindo(true);
          void sair().finally(() => setSaindo(false));
        }}
        className="ml-auto inline-flex min-h-[var(--altura-controle)] shrink-0 items-center gap-2 rounded-controle px-3 text-sm font-semibold text-neutro-700 transition-colors hover:bg-neutro-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icone nome="sair" tamanho={17} className="text-neutro-500" />
        Sair
      </button>
    </div>
  );
}
