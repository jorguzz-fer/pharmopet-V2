import { useCallback, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { mensagemDeErro, useAtrasado, useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';

type Tutor = components['schemas']['TutorDto'];

/**
 * Busca e cadastro de tutor.
 *
 * A busca vem primeiro, e o cadastro fica atrás de um botão, porque o caso
 * frequente é o tutor já existir: abrir direto no formulário convidaria a
 * cadastrar de novo quem já está lá, e o CPF único só pega isso quando o
 * documento foi informado.
 */
export function Tutores() {
  const [busca, setBusca] = useState('');
  const [cadastrando, setCadastrando] = useState(false);
  const buscaAtrasada = useAtrasado(busca);

  const carregar = useCallback(
    () =>
      exigir(
        api.GET('/api/v1/receituario/tutores', {
          params: { query: buscaAtrasada.trim() ? { busca: buscaAtrasada.trim() } : {} },
        }),
      ),
    [buscaAtrasada],
  );

  const { estado, recarregar } = useConsulta(`tutores:${buscaAtrasada}`, carregar);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Tutores</h1>
        <Botao
          tom={cadastrando ? 'secundario' : 'primario'}
          onClick={() => setCadastrando((c) => !c)}
        >
          {cadastrando ? 'Cancelar' : 'Novo tutor'}
        </Botao>
      </div>

      {cadastrando ? (
        <NovoTutor
          aoCriar={() => {
            setCadastrando(false);
            recarregar();
          }}
        />
      ) : null}

      <Campo
        rotulo="Buscar"
        type="search"
        placeholder="Nome ou CPF"
        ajuda="O CPF pode ser digitado com ou sem pontuação."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {estado.situacao === 'carregando' ? <Carregando o="tutores" /> : null}
      {estado.situacao === 'falha' ? <Falha motivo={estado.motivo} aoTentar={recarregar} /> : null}
      {estado.situacao === 'ok' ? (
        <ListaDeTutores tutores={estado.dado.tutores} busca={busca} />
      ) : null}
    </div>
  );
}

function ListaDeTutores({ tutores, busca }: { tutores: Tutor[]; busca: string }) {
  if (tutores.length === 0) {
    return (
      <Vazio>
        {busca.trim()
          ? 'Nenhum tutor com esse nome ou CPF. Confira a digitação, ou cadastre.'
          : 'Nenhum tutor cadastrado ainda. Comece por “Novo tutor”.'}
      </Vazio>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tutores.map((t) => (
        <li key={t.id}>
          <Link
            to={`/tutores/${t.id}`}
            className="flex min-h-[var(--altura-controle)] flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-neutro-200 bg-neutro-0 px-4 py-3 hover:bg-neutro-100"
          >
            <span className="font-semibold text-neutro-900">{t.nome}</span>
            {t.cpf ? <span className="text-sm text-neutro-500">{t.cpf}</span> : null}
            {t.telefone ? <span className="text-sm text-neutro-500">{t.telefone}</span> : null}
            <span className="ml-auto text-sm text-neutro-500">
              {t.quantidadeDePacientes === 1
                ? '1 paciente'
                : `${t.quantidadeDePacientes} pacientes`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NovoTutor({ aoCriar }: { aoCriar: () => void }) {
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      await exigir(
        api.POST('/api/v1/receituario/tutores', {
          // Campo vazio vira ausência, e não string vazia: um CPF "" seria
          // recusado pela validação, e um telefone "" viraria dado sujo.
          body: {
            nome: nome.trim(),
            ...(cpf.trim() ? { cpf: cpf.trim() } : {}),
            ...(telefone.trim() ? { telefone: telefone.trim() } : {}),
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
    <Cartao titulo="Novo tutor">
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <Campo
          rotulo="Nome"
          required
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="CPF"
            inputMode="numeric"
            ajuda="Opcional. A consulta costuma vir antes do documento."
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
          />
          <Campo
            rotulo="Telefone"
            type="tel"
            inputMode="tel"
            ajuda="Com DDD."
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
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

        <Botao type="submit" disabled={enviando || nome.trim().length < 2}>
          {enviando ? 'Salvando…' : 'Cadastrar'}
        </Botao>
      </form>
    </Cartao>
  );
}
