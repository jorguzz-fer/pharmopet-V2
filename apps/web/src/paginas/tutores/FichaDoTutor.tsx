import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { formatarPeso, lerPesoEmQuilos } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { mensagemDeErro, useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';

type Paciente = components['schemas']['PacienteDto'];

const ESPECIES = [
  { valor: 'CANINO', rotulo: 'Canino' },
  { valor: 'FELINO', rotulo: 'Felino' },
  { valor: 'EQUINO', rotulo: 'Equino' },
  { valor: 'AVE', rotulo: 'Ave' },
  { valor: 'ROEDOR', rotulo: 'Roedor' },
  { valor: 'REPTIL', rotulo: 'Réptil' },
] as const;

/** Ficha do tutor, com os pacientes dele. */
export function FichaDoTutor() {
  const { id = '' } = useParams();
  const [cadastrando, setCadastrando] = useState(false);

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
          <Botao
            tom={cadastrando ? 'secundario' : 'primario'}
            onClick={() => setCadastrando((c) => !c)}
          >
            {cadastrando ? 'Cancelar' : 'Novo paciente'}
          </Botao>
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

      {!paciente.obito ? (
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

function NovoPaciente({ tutorId, aoCriar }: { tutorId: string; aoCriar: () => void }) {
  const [nome, setNome] = useState('');
  const [especie, setEspecie] = useState<Paciente['especie']>('CANINO');
  const [raca, setRaca] = useState('');
  const [peso, setPeso] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // O peso é conferido enquanto se digita, e não só no envio: descobrir que
  // "12kg" não serve depois de preencher o resto é o tipo de ida e volta que
  // faz alguém digitar qualquer coisa para o formulário parar de reclamar.
  const lido = peso.trim() === '' ? null : lerPesoEmQuilos(peso);
  const erroDoPeso = lido && !lido.valido ? lido.motivo : undefined;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      await exigir(
        api.POST('/api/v1/receituario/pacientes', {
          body: {
            tutorId,
            nome: nome.trim(),
            especie,
            ...(raca.trim() ? { raca: raca.trim() } : {}),
            ...(lido?.valido ? { pesoEmGramas: lido.emGramas } : {}),
          },
        }),
      );
      aoCriar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          rotulo="Nome"
          required
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="especie" className="text-sm font-semibold text-neutro-700">
            Espécie
          </label>
          <select
            id="especie"
            className="min-h-[var(--altura-controle)] w-full rounded-controle border border-neutro-200 bg-neutro-0 px-3 text-base"
            value={especie}
            onChange={(e) => setEspecie(e.target.value as Paciente['especie'])}
          >
            {ESPECIES.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </div>

        <Campo rotulo="Raça" value={raca} onChange={(e) => setRaca(e.target.value)} />

        <Campo
          rotulo="Peso (kg)"
          inputMode="decimal"
          placeholder="12,5"
          ajuda="Em quilos. Use vírgula para os gramas."
          erro={erroDoPeso}
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
        />
      </div>

      {erro ? (
        <p
          role="alert"
          className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
        >
          {erro}
        </p>
      ) : null}

      <Botao type="submit" disabled={enviando || nome.trim() === '' || Boolean(erroDoPeso)}>
        {enviando ? 'Salvando…' : 'Cadastrar paciente'}
      </Botao>
    </form>
  );
}
