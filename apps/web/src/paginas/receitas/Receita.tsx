import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { descreverSituacao, formatarPeso, formatarReais } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { mensagemDeErro, useConsulta } from '@/api/consulta';
import { Aviso, tomDoAviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha } from '@/componentes/Estados';
import { Selo, type TomDoSelo } from '@/componentes/Selo';
import { useSessao } from '@/sessao/SessaoContexto';

type ReceitaDto = components['schemas']['ReceitaDto'];

const APARENCIA: Record<ReceitaDto['situacao'], { tom: TomDoSelo; rotulo: string }> = {
  rascunho: { tom: 'neutro', rotulo: 'rascunho' },
  valida: { tom: 'sucesso', rotulo: 'válida' },
  vencida: { tom: 'antimicrobiano', rotulo: 'vencida' },
  cancelada: { tom: 'controlado', rotulo: 'cancelada' },
};

/** A receita inteira, com o que dá para fazer com ela agora. */
export function Receita() {
  const { id = '' } = useParams();
  const carregar = useCallback(
    () => exigir(api.GET('/api/v1/receituario/receitas/{id}', { params: { path: { id } } })),
    [id],
  );

  const { estado, recarregar } = useConsulta(`receita:${id}`, carregar);

  if (estado.situacao === 'carregando') return <Carregando o="a receita" />;
  if (estado.situacao === 'falha') return <Falha motivo={estado.motivo} aoTentar={recarregar} />;

  return <Detalhe receita={estado.dado} aoMudar={recarregar} />;
}

function Detalhe({ receita, aoMudar }: { receita: ReceitaDto; aoMudar: () => void }) {
  const { estado: sessao } = useSessao();
  const eu = sessao.situacao === 'dentro' ? sessao.usuario : null;
  const aparencia = APARENCIA[receita.situacao];
  const nota = descreverSituacao(receita.situacao);

  const souOAutor = eu?.id === receita.veterinarioId;
  const podeEmitir = receita.estado === 'RASCUNHO' && souOAutor;
  const podeCancelar = receita.estado !== 'CANCELADA' && (souOAutor || eu?.papel === 'ADMIN');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/receitas" className="text-sm text-turquesa-700 hover:underline">
          ← Receitas
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-titulo text-2xl font-extrabold tracking-tight">
            {receita.numero === null ? 'Rascunho' : `Receita nº ${receita.numero}`}
          </h1>
          <Selo tom={aparencia.tom}>{aparencia.rotulo}</Selo>
        </div>
        <p className="mt-1 text-sm text-neutro-500">
          {receita.pacienteNome} · {receita.tutorNome}
          {receita.pesoDoPacienteEmGramas !== null
            ? ` · ${formatarPeso(receita.pesoDoPacienteEmGramas)}`
            : ''}
        </p>
      </div>

      {nota ? (
        <Aviso tom={receita.situacao === 'rascunho' ? 'informacao' : 'atencao'}>{nota}</Aviso>
      ) : null}

      {receita.formulacoes.map((f, i) => (
        <Cartao
          key={f.id}
          titulo={`Fórmula ${i + 1} — ${f.forma}`}
          acessorio={
            <span className="font-titulo text-lg font-bold">
              {f.valorEmCentavos === null ? '—' : formatarReais(f.valorEmCentavos)}
            </span>
          }
        >
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-1">
              {f.itens.map((item) => (
                <li key={item.insumoId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-neutro-900">{item.descricao}</span>
                  <span className="text-neutro-700">
                    {item.doseMg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} mg
                  </span>
                  {item.listaDeControle ? (
                    <Selo tom="controlado">{item.listaDeControle}</Selo>
                  ) : null}
                </li>
              ))}
            </ul>

            <p className="text-sm text-neutro-700">
              {f.quantidade} unidades · 1 a cada {f.frequenciaHoras} h · {f.dias} dias
            </p>

            {f.orientacao ? <p className="text-sm text-neutro-500">{f.orientacao}</p> : null}

            {f.impedimentos.map((imp, n) => (
              <Aviso key={`i-${n}`} tom="impedimento">
                {imp.texto}
              </Aviso>
            ))}
            {f.avisos.map((a, n) => (
              <Aviso key={`a-${n}`} tom={tomDoAviso(a.tipo)}>
                {a.texto}
              </Aviso>
            ))}
          </div>
        </Cartao>
      ))}

      <Cartao titulo="Documento">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Linha rotulo="Prescritor" valor={receita.veterinarioNome} />
          <Linha rotulo="CRMV" valor={receita.crmv ?? '—'} />
          {/* O nome congelado na emissão, e não o do cadastro de hoje: a
              clínica pode ter mudado de nome desde então, e o papel na mão do
              tutor diz o de antes. */}
          <Linha rotulo="Clínica" valor={receita.clinicaNome ?? '—'} />
          <Linha rotulo="CNPJ da clínica" valor={receita.clinicaCnpj ?? '—'} />
          <Linha
            rotulo="Emitida em"
            valor={receita.emitidaEm ? new Date(receita.emitidaEm).toLocaleString('pt-BR') : '—'}
          />
          <Linha
            rotulo="Válida até"
            valor={receita.validaAte ? new Date(receita.validaAte).toLocaleString('pt-BR') : '—'}
          />
          {receita.prazoMotivo ? (
            <div className="sm:col-span-2">
              <Linha rotulo="Prazo" valor={receita.prazoMotivo} />
            </div>
          ) : null}
          {receita.motivoDoCancelamento ? (
            <div className="sm:col-span-2">
              <Linha rotulo="Cancelamento" valor={receita.motivoDoCancelamento} />
            </div>
          ) : null}
        </dl>

        <p className="mt-4 flex items-baseline justify-between gap-4 border-t border-neutro-100 pt-4">
          <span className="text-sm text-neutro-500">Total</span>
          <span className="font-titulo text-2xl font-extrabold">
            {formatarReais(receita.valorTotalEmCentavos)}
          </span>
        </p>
      </Cartao>

      <Acoes
        receita={receita}
        podeEmitir={podeEmitir}
        podeCancelar={podeCancelar}
        aoMudar={aoMudar}
      />
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

function Acoes({
  receita,
  podeEmitir,
  podeCancelar,
  aoMudar,
}: {
  receita: ReceitaDto;
  podeEmitir: boolean;
  podeCancelar: boolean;
  aoMudar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');

  async function emitir() {
    setErro(null);
    setOcupado(true);
    try {
      await exigir(
        api.POST('/api/v1/receituario/receitas/{id}/emitir', {
          params: { path: { id: receita.id } },
        }),
      );
      aoMudar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    setErro(null);
    setOcupado(true);
    try {
      await exigir(
        api.POST('/api/v1/receituario/receitas/{id}/cancelar', {
          params: { path: { id: receita.id } },
          body: { motivo: motivo.trim() },
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

  if (!podeEmitir && !podeCancelar) return null;

  return (
    <div className="flex flex-col gap-3">
      {erro ? (
        <p
          role="alert"
          className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
        >
          {erro}
        </p>
      ) : null}

      {cancelando ? (
        <Cartao titulo="Cancelar receita">
          <div className="flex flex-col gap-4">
            <Campo
              rotulo="Motivo"
              required
              autoFocus
              ajuda="Fica registrado. Receita emitida não se apaga — cancela-se, com motivo."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Botao tom="perigo" onClick={cancelar} disabled={ocupado || motivo.trim().length < 3}>
                {ocupado ? 'Cancelando…' : 'Confirmar cancelamento'}
              </Botao>
              <Botao tom="secundario" onClick={() => setCancelando(false)}>
                Voltar
              </Botao>
            </div>
          </div>
        </Cartao>
      ) : (
        <div className="flex flex-wrap gap-2">
          {podeEmitir ? (
            <Botao onClick={emitir} disabled={ocupado}>
              {ocupado ? 'Emitindo…' : 'Emitir receita'}
            </Botao>
          ) : null}
          {podeCancelar ? (
            <Botao tom="perigo" onClick={() => setCancelando(true)}>
              Cancelar receita
            </Botao>
          ) : null}
        </div>
      )}

      {podeEmitir ? (
        <p className="text-xs text-neutro-500">
          A emissão numera a receita e congela preço, peso e CRMV. Depois dela, correção é cancelar
          e emitir outra.
        </p>
      ) : null}
    </div>
  );
}
