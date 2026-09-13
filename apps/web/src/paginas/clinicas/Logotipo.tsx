import { useRef, useState } from 'react';
import { exigir } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { mensagemDeErro } from '@/api/consulta';
import { ambiente } from '@/config/ambiente';
import { Botao } from '@/componentes/Botao';
import { Cartao } from '@/componentes/Cartao';

/** O mesmo teto do DTO. Recusar aqui poupa a subida de meio megabyte inútil. */
const MAXIMO_EM_BYTES = 512 * 1024;

const TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
type TipoAceito = (typeof TIPOS)[number];

/**
 * O logotipo impresso no cabeçalho da receita.
 *
 * Vem da clínica que está prescrevendo, não da Pharmopet: é a receita daquele
 * consultório, e é o nome dele que o tutor reconhece no papel.
 */
export function Logotipo({
  clinicaId,
  temLogotipo,
  atualizadaEm,
  podeTrocar,
  aoTrocar,
}: {
  clinicaId: string;
  temLogotipo: boolean;
  /**
   * Fura o cache do navegador.
   *
   * Um contador local não serviria: recarregar a clínica troca a tela por
   * "carregando" e desmonta este componente, zerando o contador junto. E
   * ainda deixaria o logotipo velho na tela de todo mundo que não tivesse
   * feito o envio.
   */
  atualizadaEm: string;
  podeTrocar: boolean;
  aoTrocar: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File) {
    setErro(null);

    if (!(TIPOS as readonly string[]).includes(arquivo.type)) {
      setErro('Use PNG, JPEG, WebP ou SVG.');
      return;
    }
    if (arquivo.size > MAXIMO_EM_BYTES) {
      setErro('O arquivo passa de 512 KB. Reduza antes de enviar.');
      return;
    }

    setEnviando(true);
    try {
      await exigir(
        api.PUT('/api/v1/clinicas/{id}/logotipo', {
          params: { path: { id: clinicaId } },
          body: { tipo: arquivo.type as TipoAceito, conteudoBase64: await paraBase64(arquivo) },
        }),
      );
      aoTrocar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
      // Sem isto, escolher o mesmo arquivo de novo não dispara `change`, e uma
      // tentativa que falhou não pode ser repetida sem trocar de arquivo.
      if (entrada.current) entrada.current.value = '';
    }
  }

  return (
    <Cartao titulo="Logotipo">
      <div className="flex flex-col gap-4">
        {temLogotipo ? (
          <img
            src={`${ambiente.VITE_API_URL}/api/v1/clinicas/${clinicaId}/logotipo?v=${encodeURIComponent(atualizadaEm)}`}
            // A rota exige sessão, e imagem de outra origem não manda cookie
            // por padrão — sem isto o logotipo viria 401 em produção, onde a
            // API mora num host diferente do app.
            crossOrigin="use-credentials"
            alt="Logotipo da clínica"
            className="max-h-24 max-w-full self-start object-contain"
          />
        ) : (
          <p className="text-sm text-neutro-500">
            Sem logotipo. A receita sai com o cabeçalho em texto até haver um.
          </p>
        )}

        {podeTrocar ? (
          <div className="flex flex-col gap-2">
            <input
              ref={entrada}
              type="file"
              accept={TIPOS.join(',')}
              className="sr-only"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void enviar(arquivo);
              }}
            />
            <Botao
              tom="secundario"
              disabled={enviando}
              onClick={() => entrada.current?.click()}
              className="self-start"
            >
              {enviando ? 'Enviando…' : temLogotipo ? 'Trocar logotipo' : 'Enviar logotipo'}
            </Botao>
            <p className="text-xs text-neutro-500">PNG, JPEG, WebP ou SVG, até 512 KB.</p>
          </div>
        ) : null}

        {erro ? (
          <p role="alert" className="text-sm text-controlado-texto">
            {erro}
          </p>
        ) : null}
      </div>
    </Cartao>
  );
}

/**
 * O arquivo como base64, sem o prefixo `data:`.
 *
 * `readAsDataURL` devolve `data:image/png;base64,AAA…`; o servidor espera só a
 * parte depois da vírgula, e o tipo vai em campo próprio.
 */
function paraBase64(arquivo: File): Promise<string> {
  return new Promise((resolver, recusar) => {
    const leitor = new FileReader();

    leitor.onerror = () => recusar(new Error('Não foi possível ler o arquivo.'));
    leitor.onload = () => {
      const texto = typeof leitor.result === 'string' ? leitor.result : '';
      const virgula = texto.indexOf(',');

      if (virgula === -1) {
        recusar(new Error('Não foi possível ler o arquivo.'));
        return;
      }

      resolver(texto.slice(virgula + 1));
    };
    leitor.readAsDataURL(arquivo);
  });
}
