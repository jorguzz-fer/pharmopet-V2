import { useCallback, useState } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import {
  formatarReais,
  proximosEstados,
  rotuloDoEstado,
  type EstadoDoPedido,
} from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { mensagemDeErro, useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha } from '@/componentes/Estados';
import { Selo, type TomDoSelo } from '@/componentes/Selo';
import { usePapel } from '@/sessao/SessaoContexto';

type Pedido = components['schemas']['PedidoDto'];

export const TOM: Record<EstadoDoPedido, TomDoSelo> = {
  EM_ANALISE: 'neutro',
  EM_PRODUCAO: 'antimicrobiano',
  PRONTO: 'sucesso',
  ENTREGUE: 'neutro',
  CANCELADO: 'controlado',
};

/**
 * A fila da farmácia.
 *
 * A primeira tela do sistema feita para quem produz. Ordena por chegada, e não
 * pelo mais recente, porque é assim que a bancada trabalha — e o pedido mais
 * antigo é justamente o que não pode ficar no fim da lista.
 */
export function Pedidos() {
  const [soAbertos, setSoAbertos] = useState(true);

  const carregar = useCallback(
    () =>
      exigir(
        api.GET('/api/v1/pedidos', {
          params: { query: soAbertos ? { emAberto: 'true' } : {} },
        }),
      ),
    [soAbertos],
  );
  const { estado, recarregar } = useConsulta(`pedidos:${soAbertos}`, carregar);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Fila da farmácia</h1>
        <label className="flex items-center gap-2 text-sm text-neutro-700">
          <input
            type="checkbox"
            checked={soAbertos}
            onChange={(e) => setSoAbertos(e.target.checked)}
            className="size-4 rounded border-neutro-300"
          />
          Só o que está em aberto
        </label>
      </div>

      {estado.situacao === 'carregando' ? <Carregando o="a fila" /> : null}
      {estado.situacao === 'falha' ? <Falha motivo={estado.motivo} aoTentar={recarregar} /> : null}

      {estado.situacao === 'ok' ? (
        estado.dado.pedidos.length === 0 ? (
          <p className="text-sm text-neutro-500">
            {soAbertos
              ? 'Nada na fila. Quando um veterinário enviar uma receita, ela aparece aqui.'
              : 'Nenhum pedido ainda.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {estado.dado.pedidos.map((p) => (
              <li key={p.id}>
                <NaFila pedido={p} aoMudar={recarregar} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

function NaFila({ pedido, aoMudar }: { pedido: Pedido; aoMudar: () => void }) {
  const estado = pedido.estado as EstadoDoPedido;

  return (
    <Cartao
      titulo={`Pedido nº ${pedido.numero}`}
      acessorio={<Selo tom={TOM[estado]}>{rotuloDoEstado(estado)}</Selo>}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-neutro-700">
          {pedido.pacienteNome} · tutor {pedido.tutorNome}
          {pedido.receitaNumero === null ? '' : ` · receita nº ${pedido.receitaNumero}`}
        </p>

        <ul className="flex flex-col gap-2">
          {pedido.formulacoes.map((f, i) => (
            <li key={`${f.forma}-${i}`} className="text-sm">
              <span className="font-semibold text-neutro-900">
                {f.quantidade} × {f.forma}
                {f.aroma ? ` (${f.aroma})` : ''}
              </span>
              {f.usoContinuo ? <span className="text-neutro-500"> · uso contínuo</span> : null}
              <ul className="mt-1 flex flex-col text-neutro-700">
                {f.itens.map((item, n) => (
                  <li key={`${item.descricao}-${n}`}>
                    {item.descricao} —{' '}
                    {item.doseMg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} mg por dose
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Linha rotulo="Entregar em" valor={pedido.enderecoDeEntrega} />
          <Linha rotulo="Prescrito por" valor={pedido.veterinarioNome} />
          <Linha rotulo="Clínica" valor={pedido.clinicaNome ?? '—'} />
          <Linha rotulo="Total" valor={formatarReais(pedido.valorTotalEmCentavos)} />
          {pedido.observacoes ? (
            <div className="sm:col-span-2">
              <Linha rotulo="Recado de quem enviou" valor={pedido.observacoes} />
            </div>
          ) : null}
          {pedido.motivoDoCancelamento ? (
            <div className="sm:col-span-2">
              <Linha rotulo="Cancelamento" valor={pedido.motivoDoCancelamento} />
            </div>
          ) : null}
        </dl>

        <Andamento pedido={pedido} aoMudar={aoMudar} />
      </div>
    </Cartao>
  );
}

/**
 * Os botões do que dá para fazer agora.
 *
 * Vêm da mesma tabela de transições que a API usa para recusar. Uma lista
 * escrita à mão aqui ofereceria um botão que o servidor nega — e é a pessoa na
 * bancada que descobre isso, no meio do turno.
 */
function Andamento({ pedido, aoMudar }: { pedido: Pedido; aoMudar: () => void }) {
  const papel = usePapel();
  const daFarmacia = papel === 'FARMACIA' || papel === 'ADMIN';
  const estado = pedido.estado as EstadoDoPedido;

  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');

  async function mover(para: EstadoDoPedido, porque?: string) {
    setErro(null);
    setOcupado(true);
    try {
      await exigir(
        api.POST('/api/v1/pedidos/{id}/estado', {
          params: { path: { id: pedido.id } },
          body: { estado: para, ...(porque ? { motivo: porque } : {}) },
        }),
      );
      setCancelando(false);
      setMotivo('');
      aoMudar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  // Quem prescreve só desiste enquanto ninguém começou a pesar insumo.
  const podeCancelar = daFarmacia || estado === 'EM_ANALISE';
  const avancos = daFarmacia ? proximosEstados(estado).filter((e) => e !== 'CANCELADO') : [];

  if (avancos.length === 0 && !podeCancelar) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-neutro-100 pt-4">
      {erro ? (
        <p role="alert" className="text-sm text-controlado-texto">
          {erro}
        </p>
      ) : null}

      {cancelando ? (
        <div className="flex flex-col gap-3">
          <Campo
            rotulo="Por que está cancelando?"
            required
            autoFocus
            ajuda="Fica registrado, e o tutor vê que o pedido foi cancelado."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Botao
              tom="perigo"
              disabled={ocupado || motivo.trim().length < 3}
              onClick={() => mover('CANCELADO', motivo.trim())}
            >
              {ocupado ? 'Cancelando…' : 'Confirmar cancelamento'}
            </Botao>
            <Botao tom="secundario" onClick={() => setCancelando(false)}>
              Voltar
            </Botao>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {avancos.map((proximo) => (
            <Botao key={proximo} disabled={ocupado} onClick={() => mover(proximo)}>
              {rotuloDoEstado(proximo)}
            </Botao>
          ))}
          {podeCancelar && proximosEstados(estado).includes('CANCELADO') ? (
            <Botao tom="perigo" onClick={() => setCancelando(true)}>
              Cancelar pedido
            </Botao>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-neutro-500">{rotulo}</dt>
      <dd className="font-semibold text-neutro-900">{valor}</dd>
    </div>
  );
}
