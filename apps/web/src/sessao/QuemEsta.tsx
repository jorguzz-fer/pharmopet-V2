import { useState } from 'react';
import { Botao } from '@/componentes/Botao';
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
    <div className="flex items-center gap-3">
      <div
        className="grid size-8 place-items-center rounded-pill bg-lilas-100 text-xs font-bold text-lilas-700"
        aria-hidden="true"
      >
        {iniciais(usuario.nome)}
      </div>

      <div className="hidden sm:block">
        <div className="text-sm font-semibold text-neutro-900">{usuario.nome}</div>
        <div className="text-xs text-neutro-500">{rotuloDoPapel[usuario.papel]}</div>
      </div>

      <Botao
        tom="secundario"
        disabled={saindo}
        onClick={() => {
          setSaindo(true);
          void sair().finally(() => setSaindo(false));
        }}
      >
        Sair
      </Botao>
    </div>
  );
}
