import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { formatarPeso } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';
import { ESPECIES, NovoPaciente } from '@/paginas/tutores/NovoPaciente';
import { usePodeCadastrarFicha, usePodePrescrever } from '@/sessao/SessaoContexto';

type Paciente = components['schemas']['PacienteDto'];

/** Ficha do tutor, com os pacientes dele. */
export function FichaDoTutor() {
  const { id = '' } = useParams();
  const [cadastrando, setCadastrando] = useState(false);
  const podeCadastrar = usePodeCadastrarFicha();

  const carregar = useCallback(
    async () => ({
      tutor: await exigir(
        api.GET('/api/v1/receituario/tutores/{id}', { params: { path: { id } } }),
      ),
      pacientes: await exigir(
        api.GET('/api/v1/receituario/pacientes', { params: { query: { tutorId: id } } }),
      ),
    }),
    [id],
  );

  const { estado, recarregar } = useConsulta(`tutor:${id}`, carregar);

  if (estado.situacao === 'carregando') return <Carregando o="a ficha" />;
  if (estado.situacao === 'falha') return <Falha motivo={estado.motivo} aoTentar={recarregar} />;

  const { tutor, pacientes } = estado.dado;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/tutores" className="text-sm text-turquesa-700 hover:underline">
          ← Tutores
        </Link>
        <h1 className="mt-1 font-titulo text-2xl font-extrabold tracking-tight">{tutor.nome}</h1>
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-neutro-500">
          {tutor.cpf ? <span>CPF {tutor.cpf}</span> : null}
          {tutor.telefone ? <span>{tutor.telefone}</span> : null}
          {tutor.email ? <span>{tutor.email}</span> : null}
        </p>
      </div>

      <Cartao
        titulo="Pacientes"
        acessorio={
          podeCadastrar ? (
            <Botao
              tom={cadastrando ? 'secundario' : 'primario'}
              onClick={() => setCadastrando((c) => !c)}
            >
              {cadastrando ? 'Cancelar' : 'Novo paciente'}
            </Botao>
          ) : null
        }
      >
        {cadastrando ? (
          <NovoPaciente
            tutorId={id}
            aoCriar={() => {
              setCadastrando(false);
              recarregar();
            }}
          />
        ) : pacientes.pacientes.length === 0 ? (
          <Vazio>Nenhum paciente nesta ficha. Cadastre para poder prescrever.</Vazio>
        ) : (
          <ul className="flex flex-col gap-2">
            {pacientes.pacientes.map((p) => (
              <li key={p.id}>
                <LinhaDePaciente paciente={p} />
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}

function LinhaDePaciente({ paciente }: { paciente: Paciente }) {
  const especie = ESPECIES.find((e) => e.valor === paciente.especie);
  // Só quem prescreve abre receita; para a farmácia o atalho levaria a um 403.
  const podePrescrever = usePodePrescrever();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-neutro-200 px-4 py-3">
      <span className="font-semibold text-neutro-900">{paciente.nome}</span>
      <span className="text-sm text-neutro-500">{especie?.rotulo ?? paciente.especie}</span>
      {paciente.raca ? <span className="text-sm text-neutro-500">{paciente.raca}</span> : null}

      {/* O peso é o que a conferência de dose usa. Sem ele a receita não é
          emitida, então a ausência precisa ser visível, e não só um vazio. */}
      {paciente.pesoEmGramas === null ? (
        <Selo tom="antimicrobiano">sem peso</Selo>
      ) : (
        <Selo tom="neutro">{formatarPeso(paciente.pesoEmGramas)}</Selo>
      )}

      {paciente.obito ? <Selo tom="controlado">óbito</Selo> : null}

      {!paciente.obito && podePrescrever ? (
        <Link
          to={`/receitas/nova?paciente=${paciente.id}`}
          className="ml-auto text-sm font-semibold text-turquesa-700 hover:underline"
        >
          Prescrever
        </Link>
      ) : null}
    </div>
  );
}
