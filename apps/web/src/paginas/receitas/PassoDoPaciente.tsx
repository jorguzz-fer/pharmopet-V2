import { useCallback, useEffect, useState } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { formatarPeso } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';
import { ESPECIES, NovoPaciente } from '@/paginas/tutores/NovoPaciente';

type Paciente = components['schemas']['PacienteDto'];

/**
 * Passo 2: para qual bicho.
 *
 * Quando o tutor não tem nenhum paciente, o formulário já abre: mostrar uma
 * lista vazia e pedir um clique em "Novo paciente" seria um passo a mais
 * sobre uma escolha que não existe.
 */
export function PassoDoPaciente({
  tutorId,
  aoEscolher,
  aoVoltar,
  aoSaberDoTutor,
}: {
  tutorId: string;
  aoEscolher: (paciente: Paciente) => void;
  aoVoltar: () => void;
  /**
   * Avisa o nome do tutor assim que ele chega.
   *
   * Quem desenha o trilho dos quatro passos é a página de cima, e ela só tem o
   * id na URL. Sem isso o passo 1 continuaria dizendo "Tutor ✓" sem dizer qual.
   */
  aoSaberDoTutor?: (nome: string) => void;
}) {
  const [cadastrando, setCadastrando] = useState(false);

  // O nome do tutor é buscado, e não passado de cima: assim recarregar a
  // página em `?tutor=<id>` reabre o passo inteiro, com o nome no título.
  // Um wizard que só funciona se você não der F5 é um wizard pela metade.
  const carregar = useCallback(
    async () => ({
      tutor: await exigir(
        api.GET('/api/v1/receituario/tutores/{id}', { params: { path: { id: tutorId } } }),
      ),
      pacientes: await exigir(
        api.GET('/api/v1/receituario/pacientes', { params: { query: { tutorId } } }),
      ),
    }),
    [tutorId],
  );

  const { estado, recarregar } = useConsulta(`passo-paciente:${tutorId}`, carregar);
  const nomeCarregado = estado.situacao === 'ok' ? estado.dado.tutor.nome : null;

  // Num efeito, e não no corpo: avisar o pai durante a renderização é escrever
  // no estado dele enquanto este ainda está renderizando, e o React reclama.
  useEffect(() => {
    if (nomeCarregado) aoSaberDoTutor?.(nomeCarregado);
  }, [nomeCarregado, aoSaberDoTutor]);

  if (estado.situacao === 'carregando') return <Carregando o="os pacientes" />;
  if (estado.situacao === 'falha') {
    return <Falha motivo={estado.motivo} aoTentar={recarregar} />;
  }

  const nomeDoTutor = estado.dado.tutor.nome;
  const pacientes = estado.dado.pacientes.pacientes;
  const semNenhum = pacientes.length === 0;
  const noFormulario = cadastrando || semNenhum;

  return (
    <Cartao
      titulo={`Paciente de ${nomeDoTutor}`}
      acessorio={
        <div className="flex gap-2">
          <Botao tom="secundario" onClick={aoVoltar}>
            Trocar tutor
          </Botao>
          {semNenhum ? null : (
            <Botao
              tom={cadastrando ? 'secundario' : 'primario'}
              onClick={() => setCadastrando((c) => !c)}
            >
              {cadastrando ? 'Ver os cadastrados' : 'Novo paciente'}
            </Botao>
          )}
        </div>
      }
    >
      {noFormulario ? (
        <div className="flex flex-col gap-4">
          {semNenhum ? (
            <p className="text-sm text-neutro-500">
              Este tutor ainda não tem paciente cadastrado. Cadastre para poder prescrever.
            </p>
          ) : null}
          <NovoPaciente
            tutorId={tutorId}
            rotuloDoBotao="Cadastrar e continuar"
            aoCriar={aoEscolher}
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {pacientes.map((p) => (
            <li key={p.id}>
              <Escolha paciente={p} aoEscolher={aoEscolher} />
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

function Escolha({
  paciente,
  aoEscolher,
}: {
  paciente: Paciente;
  aoEscolher: (paciente: Paciente) => void;
}) {
  const especie = ESPECIES.find((e) => e.valor === paciente.especie);
  // Sem peso a dose não tem contra o que ser conferida, e a montagem recusa.
  // Dizer isso aqui evita escolher e levar um não na tela seguinte.
  const peso = paciente.pesoEmGramas;

  return (
    <button
      type="button"
      onClick={() => aoEscolher(paciente)}
      className="flex min-h-[var(--altura-controle)] w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-neutro-200 bg-neutro-0 px-4 py-3 text-left hover:border-turquesa-500 hover:bg-neutro-100"
    >
      <span className="font-semibold text-neutro-900">{paciente.nome}</span>
      <span className="text-sm text-neutro-500">{especie?.rotulo ?? paciente.especie}</span>
      {paciente.raca ? <span className="text-sm text-neutro-500">{paciente.raca}</span> : null}
      <span className="ml-auto">
        {peso === null ? (
          <Selo tom="antimicrobiano">sem peso</Selo>
        ) : (
          <Selo tom="neutro">{formatarPeso(peso)}</Selo>
        )}
      </span>
    </button>
  );
}
