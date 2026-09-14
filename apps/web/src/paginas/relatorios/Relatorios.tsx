import { useCallback, useState } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { formatarReais } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { useConsulta } from '@/api/consulta';
import { aparenciaDeBotao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { ambiente } from '@/config/ambiente';

type Relatorio = components['schemas']['RelatorioDePrescricoesDto'];
type Linha = Relatorio['porVeterinario'][number];

/** `2026-09`, que é o que o `<input type="month">` fala. */
function mesCorrente(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Relatório de prescrições.
 *
 * Duas quebras do mesmo mês: por quem prescreveu e por clínica. A segunda é o
 * eixo de acerto de contas — o desconto e a taxa de manipulação são do acordo
 * de cada clínica (ADR 0012).
 *
 * O número é **valor prescrito**, nunca faturamento (ADR 0017): soma das
 * receitas emitidas, e não do que foi pago, porque não há meio de pagamento.
 */
export function Relatorios() {
  const [mes, setMes] = useState(mesCorrente());

  const carregar = useCallback(
    () =>
      exigir(api.GET('/api/v1/relatorios/prescricoes', { params: { query: mes ? { mes } : {} } })),
    [mes],
  );

  const { estado, recarregar } = useConsulta(`relatorio:${mes}`, carregar);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Relatórios</h1>
        <p className="mt-1 text-sm text-neutro-500">
          O que foi prescrito no mês, por quem prescreveu e por clínica.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-48">
          <Campo rotulo="Mês" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>

        {/*
          Link, e não `fetch`: o navegador baixa por navegação de topo, e aí o
          cookie `SameSite=Lax` vai junto — download autenticado sem token na
          URL. `download` é dica; quem manda é o `content-disposition` da API.
        */}
        <a
          href={`${ambiente.VITE_API_URL}/api/v1/relatorios/prescricoes.csv${mes ? `?mes=${mes}` : ''}`}
          download
          className={aparenciaDeBotao({ tom: 'secundario' })}
        >
          Baixar planilha
        </a>
      </div>

      {estado.situacao === 'carregando' ? <Carregando o="o relatório" /> : null}
      {estado.situacao === 'falha' ? <Falha motivo={estado.motivo} aoTentar={recarregar} /> : null}
      {estado.situacao === 'ok' ? <Resultado relatorio={estado.dado} /> : null}
    </div>
  );
}

function Resultado({ relatorio }: { relatorio: Relatorio }) {
  if (relatorio.receitas === 0) {
    return <Vazio>Nenhuma receita emitida neste mês.</Vazio>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Total rotulo="Receitas emitidas" valor={String(relatorio.receitas)} />
        <Total
          rotulo="Valor prescrito"
          valor={formatarReais(relatorio.valorEmCentavos)}
          ajuda="Soma das emitidas. Não é o que foi pago."
        />
      </div>

      <Tabela
        titulo="Por veterinário"
        colunaDetalhe="CRMV"
        linhas={relatorio.porVeterinario}
        total={relatorio.valorEmCentavos}
      />
      <Tabela
        titulo="Por clínica"
        linhas={relatorio.porClinica}
        total={relatorio.valorEmCentavos}
      />
    </div>
  );
}

function Total({ rotulo, valor, ajuda }: { rotulo: string; valor: string; ajuda?: string }) {
  return (
    <div className="rounded-card border border-neutro-200 bg-neutro-0 px-4 py-4">
      <p className="text-sm font-semibold text-neutro-500">{rotulo}</p>
      <p className="mt-1 font-titulo text-3xl font-extrabold tracking-tight">{valor}</p>
      {ajuda ? <p className="mt-1 text-xs text-neutro-500">{ajuda}</p> : null}
    </div>
  );
}

/**
 * Uma quebra, com a participação de cada linha no total.
 *
 * A porcentagem existe para a leitura de acerto de contas: "esta clínica é
 * 40% do mês" é a pergunta que se faz, e fazer a divisão de cabeça a cada
 * linha é o tipo de conta que sai errada na terceira.
 */
function Tabela({
  titulo,
  colunaDetalhe,
  linhas,
  total,
}: {
  titulo: string;
  colunaDetalhe?: string;
  linhas: Linha[];
  total: number;
}) {
  return (
    <Cartao titulo={titulo}>
      {/* A tabela é o que pode ser mais larga que a tela, e rola sozinha —
          a página não. */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutro-200 text-neutro-500">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Nome
              </th>
              {colunaDetalhe ? (
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {colunaDetalhe}
                </th>
              ) : null}
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Receitas
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Valor prescrito
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Participação
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.id ?? linha.nome} className="border-b border-neutro-100 last:border-0">
                <td className="py-2 pr-4 font-semibold text-neutro-900">{linha.nome}</td>
                {colunaDetalhe ? (
                  <td className="py-2 pr-4 text-neutro-500">{linha.detalhe ?? '—'}</td>
                ) : null}
                <td className="py-2 pr-4 text-right tabular-nums">{linha.receitas}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {formatarReais(linha.valorEmCentavos)}
                </td>
                <td className="py-2 text-right tabular-nums text-neutro-500">
                  {participacao(linha.valorEmCentavos, total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

/**
 * A fatia da linha no total.
 *
 * Total zero acontece — um mês em que tudo saiu com valor zerado — e dividir
 * por ele daria `NaN%` na tela.
 */
function participacao(valor: number, total: number): string {
  if (total === 0) return '—';

  return `${((valor / total) * 100).toFixed(1).replace('.', ',')}%`;
}
