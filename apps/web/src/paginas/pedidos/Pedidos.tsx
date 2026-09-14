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
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Icone } from '@/componentes/Icone';
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
 * As colunas do quadro, na ordem em que o trabalho anda (ADR 0014).
 *
 * Entregue e cancelado ficam fora: são o fim do caminho, e uma coluna que só
 * cresce empurraria as três que importam para um canto da tela.
 */
const COLUNAS: { estado: EstadoDoPedido; cor: string }[] = [
  { estado: 'EM_ANALISE', cor: 'bg-lilas-700' },
  { estado: 'EM_PRODUCAO', cor: 'bg-antimicrobiano-base' },
  { estado: 'PRONTO', cor: 'bg-sucesso-base' },
];

/**
 * A fila da farmácia.
 *
 * A primeira tela do sistema feita para quem produz. É um quadro, e não uma
 * lista: numa lista só, "o que entra agora", "o que está no gral" e "o que já
 * pode ser retirado" ficam intercalados, e a pessoa na bancada relê a fila
 * inteira para achar o próximo. Em três colunas ela olha uma coluna.
 *
 * Cada cartão ordena por chegada e mostra há quanto tempo espera — o pedido
 * mais antigo é justamente o que não pode ficar no fim.
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

  const pedidos = estado.situacao === 'ok' ? estado.dado.pedidos : [];
  const abertos = pedidos.filter((p) => COLUNAS.some((c) => c.estado === p.estado));
  const encerrados = pedidos.filter((p) => !COLUNAS.some((c) => c.estado === p.estado));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Fila da farmácia</h1>
          {estado.situacao === 'ok' ? (
            <p className="mt-0.5 text-sm text-neutro-500">{resumo(abertos)}</p>
          ) : null}
        </div>

        {/*
          Dois botões em vez da caixa de marcar que havia aqui: a caixa nativa
          sai no azul do sistema operacional, que é a única cor da tela que não
          vem dos tokens — e "Só o que está em aberto" obrigava a ler para
          descobrir o que estava vendo.
        */}
        <div
          role="group"
          aria-label="O que mostrar"
          className="flex overflow-hidden rounded-controle border border-neutro-200 bg-neutro-0"
        >
          <BotaoDoFiltro ativo={soAbertos} aoClicar={() => setSoAbertos(true)}>
            Em aberto
          </BotaoDoFiltro>
          <BotaoDoFiltro ativo={!soAbertos} aoClicar={() => setSoAbertos(false)}>
            Tudo
          </BotaoDoFiltro>
        </div>
      </div>

      {estado.situacao === 'carregando' ? <Carregando o="a fila" linhas={4} /> : null}
      {estado.situacao === 'falha' ? (
        <Falha titulo="Não deu para carregar a fila" motivo={estado.motivo} aoTentar={recarregar} />
      ) : null}

      {estado.situacao === 'ok' ? (
        pedidos.length === 0 ? (
          <Cartao semRespiro>
            <Vazio
              icone="pedidos"
              // Sem o filtro não é "a fila" que está vazia: é o histórico
              // inteiro, encerrados incluídos.
              titulo={soAbertos ? 'A fila está vazia' : 'Nenhum pedido ainda'}
            >
              {soAbertos
                ? 'Pedidos chegam aqui quando um veterinário envia uma receita emitida para manipulação.'
                : 'Nem em aberto, nem encerrado — ninguém enviou receita para manipulação ainda.'}
            </Vazio>
          </Cartao>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              {COLUNAS.map((coluna) => {
                const daColuna = abertos.filter((p) => p.estado === coluna.estado);

                return (
                  // `aria-labelledby` e não só o `h2`: uma `section` sem nome
                  // acessível não é marco nenhum, e quem navega por marcos
                  // pulava as três colunas como se fossem um bloco só.
                  <section
                    key={coluna.estado}
                    aria-labelledby={`coluna-${coluna.estado}`}
                    className="flex flex-col gap-3"
                  >
                    <h2 id={`coluna-${coluna.estado}`} className="flex items-center gap-2.5 px-0.5">
                      <span
                        aria-hidden="true"
                        className={`size-2.5 shrink-0 rounded-pill ${coluna.cor}`}
                      />
                      <span className="font-titulo text-sm font-extrabold">
                        {rotuloDoEstado(coluna.estado)}
                      </span>
                      <span className="rounded-pill bg-neutro-100 px-2 py-0.5 font-mono text-micro text-neutro-500">
                        {daColuna.length}
                      </span>
                    </h2>

                    {daColuna.length === 0 ? (
                      <p className="rounded-card border border-dashed border-neutro-200 px-4 py-6 text-center text-xs text-neutro-500">
                        Nada aqui.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {daColuna.map((p) => (
                          <li key={p.id}>
                            <NaFila pedido={p} aoMudar={recarregar} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>

            {encerrados.length > 0 ? (
              <section aria-labelledby="coluna-encerrados" className="flex flex-col gap-3">
                <h2
                  id="coluna-encerrados"
                  className="px-0.5 font-titulo text-sm font-extrabold text-neutro-700"
                >
                  Encerrados
                </h2>
                <ul className="grid gap-3 lg:grid-cols-3">
                  {encerrados.map((p) => (
                    <li key={p.id}>
                      <NaFila pedido={p} aoMudar={recarregar} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}

function BotaoDoFiltro({
  ativo,
  aoClicar,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoClicar}
      className={[
        'min-h-[var(--altura-controle)] px-4 text-sm transition-colors',
        ativo
          ? 'bg-turquesa-700 font-semibold text-neutro-0'
          : 'text-neutro-700 hover:bg-neutro-100',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function NaFila({ pedido, aoMudar }: { pedido: Pedido; aoMudar: () => void }) {
  const estado = pedido.estado as EstadoDoPedido;
  const espera = esperaDesde(pedido.criadoEm);

  return (
    <Cartao
      titulo={`Pedido nº ${pedido.numero}`}
      acessorio={
        <span className="flex items-center gap-2">
          {/* Depois de um dia na fila o relógio muda de cor. Não é enfeite: é o
              único sinal de que aquele cartão passou do que se considera
              aceitável, e ele precisa saltar sem que ninguém leia a data. */}
          <span
            className={[
              'flex items-center gap-1 text-micro font-semibold',
              espera.demais ? 'text-controlado-texto' : 'text-neutro-500',
            ].join(' ')}
            title={new Date(pedido.criadoEm).toLocaleString('pt-BR')}
          >
            <Icone nome="relogio" tamanho={13} />
            {espera.rotulo}
          </span>
          <Selo tom={TOM[estado]}>{rotuloDoEstado(estado)}</Selo>
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <span className="font-semibold text-neutro-900">{pedido.pacienteNome}</span>
          <span className="text-neutro-500"> · tutor {pedido.tutorNome}</span>
          {pedido.receitaNumero === null ? (
            ''
          ) : (
            <span className="text-neutro-500"> · receita nº {pedido.receitaNumero}</span>
          )}
        </p>

        <ul className="flex flex-col gap-2">
          {pedido.formulacoes.map((f, i) => (
            <li key={`${f.forma}-${i}`} className="rounded-controle bg-neutro-50 px-3 py-2 text-sm">
              <span className="font-semibold text-neutro-900">
                {f.quantidade} × {f.forma}
                {f.aroma ? ` (${f.aroma})` : ''}
              </span>
              {f.usoContinuo ? <span className="text-neutro-500"> · uso contínuo</span> : null}
              <ul className="mt-1 flex flex-col text-xs text-neutro-700">
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

        <dl className="grid gap-x-6 gap-y-2 text-xs">
          <Linha rotulo="Entregar em" valor={pedido.enderecoDeEntrega} />
          <Linha rotulo="Prescrito por" valor={pedido.veterinarioNome} />
          <Linha rotulo="Clínica" valor={pedido.clinicaNome ?? '—'} />
          <Linha rotulo="Total" valor={formatarReais(pedido.valorTotalEmCentavos)} />
          {pedido.observacoes ? (
            <Linha rotulo="Recado de quem enviou" valor={pedido.observacoes} />
          ) : null}
          {pedido.motivoDoCancelamento ? (
            <Linha rotulo="Cancelamento" valor={pedido.motivoDoCancelamento} />
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
    <div className="flex flex-col gap-3 border-t border-neutro-100 pt-3">
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
        <div className="flex flex-col gap-2">
          {/* O avanço ocupa a largura toda, e o cancelamento não: numa coluna
              estreita dois botões lado a lado ficam do mesmo tamanho, e a ação
              destrutiva passa a parecer tão esperada quanto a outra. */}
          {avancos.map((proximo) => (
            <Botao key={proximo} larguraTotal disabled={ocupado} onClick={() => mover(proximo)}>
              {rotuloDoEstado(proximo)}
              <Icone nome="adiante" tamanho={16} />
            </Botao>
          ))}
          {podeCancelar && proximosEstados(estado).includes('CANCELADO') ? (
            <button
              type="button"
              onClick={() => setCancelando(true)}
              className="self-start px-1 text-xs font-semibold text-controlado-texto hover:underline"
            >
              Cancelar pedido
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-neutro-500">{rotulo}</dt>
      <dd className="ml-auto text-right font-semibold text-neutro-900">{valor}</dd>
    </div>
  );
}

/**
 * Há quanto tempo o pedido espera.
 *
 * Arredonda para baixo e para a maior unidade que couber: na bancada, "2 d"
 * decide o que fazer primeiro, e "2 dias, 4 horas e 11 minutos" não decide
 * nada melhor — só ocupa a linha inteira do cartão.
 */
export function esperaDesde(
  iso: string,
  agora: Date = new Date(),
): { rotulo: string; demais: boolean } {
  const minutos = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60000));

  if (minutos < 60) return { rotulo: `${minutos} min`, demais: false };

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return { rotulo: `${horas} h`, demais: false };

  const dias = Math.floor(horas / 24);

  return { rotulo: `${dias} d`, demais: true };
}

function resumo(abertos: Pedido[]): string {
  if (abertos.length === 0) return 'Nada em aberto.';

  const quantos =
    abertos.length === 1 ? '1 pedido em aberto' : `${abertos.length} pedidos em aberto`;
  const maisAntigo = abertos.reduce((a, b) => (a.criadoEm <= b.criadoEm ? a : b));

  return `${quantos} · o mais antigo está na fila há ${esperaDesde(maisAntigo.criadoEm).rotulo}`;
}
