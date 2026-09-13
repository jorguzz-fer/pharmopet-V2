import { useState } from 'react';
import { Botao } from '@/componentes/Botao';
import { Cartao } from '@/componentes/Cartao';
import { ambiente } from '@/config/ambiente';

/**
 * O que o veterinário entrega ao tutor: o PDF e o link.
 *
 * Só aparece com a receita emitida. Rascunho não tem número, não tem validade
 * e não tem link — e oferecer "copiar link" antes da emissão convidaria a
 * mandar ao tutor uma fórmula que ainda vai mudar.
 */
export function Entrega({ receitaId, tokenPublico }: { receitaId: string; tokenPublico: string }) {
  const link = `${window.location.origin}/r/${tokenPublico}`;
  const pdf = `${ambiente.VITE_API_URL}/api/v1/receituario/receitas/${receitaId}/pdf`;

  return (
    <Cartao titulo="Entregar ao tutor">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-neutro-700">
          O link abre sem login, de qualquer celular. Quem o tiver vê esta receita, então mande-o só
          ao tutor.
        </p>

        <div className="flex flex-wrap gap-2">
          {/* Navegação de topo, e não `fetch`: o cookie de sessão é SameSite=Lax,
              que o navegador manda numa navegação assim mesmo com a API em
              outro host — e assim o PDF abre no leitor nativo do celular. */}
          <a
            href={pdf}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-controle bg-turquesa-700 px-4 py-2 text-sm font-semibold text-branco hover:bg-turquesa-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquesa-700"
          >
            Abrir o PDF
          </a>
          <Copiar link={link} />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-neutro-500">Link do tutor</span>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-controle border border-neutro-200 bg-neutro-50 px-3 py-2 font-mono text-xs text-neutro-700"
          />
        </label>
      </div>
    </Cartao>
  );
}

/**
 * Copiar com resposta visível.
 *
 * Sem o aviso de "copiado", a pessoa clica de novo por não ter certeza — e
 * `navigator.clipboard` não existe fora de HTTPS nem em todo navegador, então
 * a falha precisa dizer o que fazer em vez de não acontecer nada.
 */
function Copiar({ link }: { link: string }) {
  const [estado, setEstado] = useState<'parado' | 'copiado' | 'falhou'>('parado');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setEstado('copiado');
      window.setTimeout(() => setEstado('parado'), 2000);
    } catch {
      setEstado('falhou');
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Botao tom="secundario" onClick={copiar}>
        {estado === 'copiado' ? 'Copiado' : 'Copiar link'}
      </Botao>
      {estado === 'falhou' ? (
        <span role="alert" className="text-xs text-controlado-texto">
          Não foi possível copiar. Selecione o link abaixo e copie à mão.
        </span>
      ) : null}
    </div>
  );
}
