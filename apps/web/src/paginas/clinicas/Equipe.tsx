import { useCallback, useState } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { mensagemDeErro, useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';
import { rotuloDoPapel } from '@/sessao/papeis';

type Vinculo = components['schemas']['ListaDeVinculosDto']['vinculos'][number];
type Usuario = components['schemas']['ListaDeUsuariosDto']['usuarios'][number];

/**
 * Quem atende ou opera nesta clínica.
 *
 * O vínculo é o que decide o escopo (ADR 0012): dois veterinários da mesma
 * clínica enxergam a mesma clientela, e é aqui que essa ligação se faz e se
 * desfaz. Desfazer não apaga nada — as receitas emitidas sob o vínculo
 * continuam de pé, com a clínica congelada nelas.
 */
export function Equipe({ clinicaId, podeEditar }: { clinicaId: string; podeEditar: boolean }) {
  const [vinculando, setVinculando] = useState(false);

  const carregar = useCallback(
    () =>
      exigir(api.GET('/api/v1/clinicas/{id}/usuarios', { params: { path: { id: clinicaId } } })),
    [clinicaId],
  );
  const { estado, recarregar } = useConsulta(`equipe:${clinicaId}`, carregar);

  return (
    <Cartao
      titulo="Equipe"
      acessorio={
        podeEditar ? (
          <Botao tom="secundario" onClick={() => setVinculando((v) => !v)}>
            {vinculando ? 'Cancelar' : 'Vincular pessoa'}
          </Botao>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {vinculando ? (
          <Vincular
            clinicaId={clinicaId}
            jaVinculados={estado.situacao === 'ok' ? estado.dado.vinculos : []}
            aoVincular={() => {
              setVinculando(false);
              recarregar();
            }}
          />
        ) : null}

        {estado.situacao === 'carregando' ? <Carregando o="a equipe" /> : null}
        {estado.situacao === 'falha' ? (
          <Falha motivo={estado.motivo} aoTentar={recarregar} />
        ) : null}
        {estado.situacao === 'ok' ? (
          estado.dado.vinculos.length === 0 ? (
            <Vazio>
              Ninguém vinculado ainda. Sem vínculo, as receitas desta clínica não têm quem as emita.
            </Vazio>
          ) : (
            <ul className="flex flex-col gap-2">
              {estado.dado.vinculos.map((v) => (
                <ItemDaEquipe
                  key={v.usuarioId}
                  clinicaId={clinicaId}
                  vinculo={v}
                  podeEditar={podeEditar}
                  aoDesvincular={recarregar}
                />
              ))}
            </ul>
          )
        ) : null}
      </div>
    </Cartao>
  );
}

function ItemDaEquipe({
  clinicaId,
  vinculo,
  podeEditar,
  aoDesvincular,
}: {
  clinicaId: string;
  vinculo: Vinculo;
  podeEditar: boolean;
  aoDesvincular: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);

  async function desvincular() {
    setErro(null);
    setRemovendo(true);

    try {
      await exigir(
        api.DELETE('/api/v1/clinicas/{id}/usuarios/{usuarioId}', {
          params: { path: { id: clinicaId, usuarioId: vinculo.usuarioId } },
        }),
      );
      aoDesvincular();
    } catch (e) {
      setErro(mensagemDeErro(e));
      setRemovendo(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-controle border border-neutro-200 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold text-neutro-900">{vinculo.nome}</span>
        <Selo>{rotuloDoPapel[vinculo.papel]}</Selo>
        {vinculo.crmv ? <span className="text-sm text-neutro-500">CRMV {vinculo.crmv}</span> : null}
        {vinculo.cargo ? <span className="text-sm text-neutro-500">{vinculo.cargo}</span> : null}
        <span className="text-sm text-neutro-500">{vinculo.email}</span>

        {podeEditar ? (
          <span className="ml-auto">
            {confirmando ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-neutro-700">Encerrar o vínculo?</span>
                <Botao tom="perigo" disabled={removendo} onClick={desvincular}>
                  {removendo ? 'Encerrando…' : 'Encerrar'}
                </Botao>
                <Botao tom="secundario" onClick={() => setConfirmando(false)}>
                  Não
                </Botao>
              </span>
            ) : (
              <Botao tom="secundario" onClick={() => setConfirmando(true)}>
                Remover
              </Botao>
            )}
          </span>
        ) : null}
      </div>

      {erro ? (
        <p role="alert" className="text-sm text-controlado-texto">
          {erro}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Escolher quem vincular, de uma lista em vez de um campo de id.
 *
 * Pedir o UUID na mão seria convidar ao erro de copiar o id errado — e um
 * vínculo errado dá a alguém a clientela de outra clínica.
 */
function Vincular({
  clinicaId,
  jaVinculados,
  aoVincular,
}: {
  clinicaId: string;
  jaVinculados: Vinculo[];
  aoVincular: () => void;
}) {
  const [escolhido, setEscolhido] = useState('');
  const [cargo, setCargo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => exigir(api.GET('/api/v1/auth/usuarios', {})), []);
  const { estado } = useConsulta('usuarios', carregar);

  const vinculados = new Set(jaVinculados.map((v) => v.usuarioId));
  const candidatos: Usuario[] =
    estado.situacao === 'ok'
      ? estado.dado.usuarios.filter(
          // Já vinculado não reaparece; FARMACIA não se vincula a clínica —
          // ela atende todas, e um vínculo aqui não mudaria o que ela enxerga.
          (u) => !vinculados.has(u.id) && u.papel !== 'FARMACIA',
        )
      : [];

  async function enviar() {
    setErro(null);
    setEnviando(true);

    try {
      await exigir(
        api.POST('/api/v1/clinicas/{id}/usuarios', {
          params: { path: { id: clinicaId } },
          body: { usuarioId: escolhido, cargo: cargo.trim() || null },
        }),
      );
      aoVincular();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-controle border border-neutro-200 bg-neutro-100 p-4">
      {estado.situacao === 'carregando' ? <Carregando o="pessoas" /> : null}
      {estado.situacao === 'falha' ? <Falha motivo={estado.motivo} /> : null}
      {estado.situacao === 'ok' ? (
        candidatos.length === 0 ? (
          <Vazio>Todo mundo já está vinculado a esta clínica.</Vazio>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-neutro-700">Pessoa</span>
              <select
                value={escolhido}
                onChange={(e) => setEscolhido(e.target.value)}
                className="min-h-[var(--altura-controle)] w-full rounded-controle border border-neutro-200 bg-neutro-0 px-3 text-base text-neutro-900"
              >
                <option value="">Escolha…</option>
                {candidatos.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} — {rotuloDoPapel[u.papel]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-neutro-700">Cargo</span>
              <input
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Opcional"
                className="min-h-[var(--altura-controle)] w-full rounded-controle border border-neutro-200 bg-neutro-0 px-3 text-base text-neutro-900 placeholder:text-neutro-500"
              />
            </label>

            {erro ? (
              <p role="alert" className="text-sm text-controlado-texto">
                {erro}
              </p>
            ) : null}

            <Botao disabled={enviando || escolhido === ''} onClick={enviar} className="self-start">
              {enviando ? 'Vinculando…' : 'Vincular'}
            </Botao>
          </>
        )
      ) : null}
    </div>
  );
}
