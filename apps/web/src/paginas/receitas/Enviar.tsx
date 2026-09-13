import { useState } from 'react';
import { Link } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { rotuloDoEstado, type DestinoDaEntrega, type EstadoDoPedido } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { mensagemDeErro } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { Selo } from '@/componentes/Selo';
import { TOM } from '@/paginas/pedidos/Pedidos';

type Pedido = components['schemas']['PedidoDto'];

/**
 * Mandar a receita para a farmácia.
 *
 * Só aparece em receita válida: rascunho, vencida e cancelada não viram
 * manipulação, e oferecer o botão para depois recusar no servidor é fazer a
 * pessoa descobrir a regra errando.
 */
export function Enviar({
  receitaId,
  temClinica,
  pedido,
  aoEnviar,
}: {
  receitaId: string;
  temClinica: boolean;
  /** O pedido vivo desta receita, quando já existe. */
  pedido: Pedido | null;
  aoEnviar: () => void;
}) {
  const [destino, setDestino] = useState<DestinoDaEntrega>(temClinica ? 'CLINICA' : 'TUTOR');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (pedido) return <JaEnviado pedido={pedido} />;

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      await exigir(
        api.POST('/api/v1/pedidos', {
          body: {
            receitaId,
            destino,
            ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
          },
        }),
      );
      aoEnviar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao titulo="Enviar à farmácia">
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-neutro-700">Onde entregar</legend>

          {temClinica ? (
            <label className="flex items-center gap-2 text-sm text-neutro-700">
              <input
                type="radio"
                name="destino"
                value="CLINICA"
                checked={destino === 'CLINICA'}
                onChange={() => setDestino('CLINICA')}
                className="size-4"
              />
              Na clínica
            </label>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-neutro-700">
            <input
              type="radio"
              name="destino"
              value="TUTOR"
              checked={destino === 'TUTOR'}
              onChange={() => setDestino('TUTOR')}
              className="size-4"
            />
            No endereço do tutor
          </label>

          <p className="text-xs text-neutro-500">
            O endereço fica gravado no pedido como está hoje. Mudar o cadastro depois não muda para
            onde a encomenda foi.
          </p>
        </fieldset>

        <Campo
          rotulo="Recado para a farmácia"
          placeholder="Cliente tem pressa, avisar quando ficar pronto…"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />

        {erro ? (
          <p role="alert" className="text-sm text-controlado-texto">
            {erro}
          </p>
        ) : null}

        <Botao onClick={enviar} disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar à farmácia'}
        </Botao>
      </div>
    </Cartao>
  );
}

/** O que a tela mostra depois do envio — inclusive a frase que o cliente pediu. */
function JaEnviado({ pedido }: { pedido: Pedido }) {
  const estado = pedido.estado as EstadoDoPedido;

  return (
    <Cartao
      titulo={`Pedido nº ${pedido.numero}`}
      acessorio={<Selo tom={TOM[estado]}>{rotuloDoEstado(estado)}</Selo>}
    >
      <div className="flex flex-col gap-3">
        {estado === 'EM_ANALISE' ? (
          <p className="text-sm text-neutro-700">
            O pedido está em análise. A equipe entrará em contato em breve.
          </p>
        ) : null}

        <p className="text-sm text-neutro-500">Entregar em: {pedido.enderecoDeEntrega}</p>

        <Link to="/pedidos" className="text-sm text-turquesa-700 hover:underline">
          Acompanhar na fila →
        </Link>
      </div>
    </Cartao>
  );
}
