import { useState, type FormEvent } from 'react';
import type { components } from '@pharmopet/api-client';
import { cnpjValido } from '@pharmopet/shared';
import { AreaDeTexto } from '@/componentes/AreaDeTexto';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';

type Clinica = components['schemas']['ClinicaDto'];
export type DadosDaClinica = components['schemas']['CriarClinicaDto'];

/**
 * O formulário do cadastro, um só para criar e para editar.
 *
 * Dois formulários quase iguais divergem: um ganha o campo de whatsapp, o
 * outro não, e a diferença só aparece quando alguém reclama que o telefone
 * sumiu ao editar.
 */
export function FormularioDeClinica({
  inicial,
  rotuloDeEnvio,
  aoEnviar,
  aoCancelar,
}: {
  inicial?: Clinica;
  rotuloDeEnvio: string;
  aoEnviar: (dados: DadosDaClinica) => Promise<void>;
  aoCancelar?: () => void;
}) {
  const [campos, setCampos] = useState(() => valoresIniciais(inicial));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mudar = (nome: keyof typeof campos) => (valor: string) =>
    setCampos((c) => ({ ...c, [nome]: valor }));

  // Conferido aqui e no servidor. Aqui para a pessoa corrigir sem esperar a
  // ida; lá porque é onde a regra vale — a tela é conveniência, não defesa.
  const cnpjPreenchido = campos.cnpj.trim() !== '';
  const cnpjErrado = cnpjPreenchido && !cnpjValido(campos.cnpj);

  const completo =
    campos.razaoSocial.trim().length >= 2 &&
    campos.nomeFantasia.trim().length >= 2 &&
    campos.responsavelLegal.trim().length >= 2 &&
    campos.email.trim() !== '' &&
    cnpjPreenchido &&
    !cnpjErrado;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      await aoEnviar(paraCorpo(campos));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6" noValidate>
      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-neutro-700">Identificação</legend>
        <Campo
          rotulo="Nome fantasia"
          required
          autoFocus
          value={campos.nomeFantasia}
          onChange={(e) => mudar('nomeFantasia')(e.target.value)}
          ajuda="É o nome que sai no cabeçalho da receita."
        />
        <Campo
          rotulo="Razão social"
          required
          value={campos.razaoSocial}
          onChange={(e) => mudar('razaoSocial')(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="CNPJ"
            required
            inputMode="numeric"
            value={campos.cnpj}
            onChange={(e) => mudar('cnpj')(e.target.value)}
            erro={cnpjErrado ? 'CNPJ inválido — confira os dígitos.' : undefined}
            ajuda="Com ou sem pontuação."
          />
          <Campo
            rotulo="Inscrição estadual"
            value={campos.inscricaoEstadual}
            onChange={(e) => mudar('inscricaoEstadual')(e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-neutro-700">Contato</legend>
        <Campo
          rotulo="E-mail"
          type="email"
          required
          value={campos.email}
          onChange={(e) => mudar('email')(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Telefone"
            type="tel"
            inputMode="tel"
            ajuda="Com DDD."
            value={campos.telefone}
            onChange={(e) => mudar('telefone')(e.target.value)}
          />
          <Campo
            rotulo="WhatsApp"
            type="tel"
            inputMode="tel"
            value={campos.whatsapp}
            onChange={(e) => mudar('whatsapp')(e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-neutro-700">Endereço</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            rotulo="CEP"
            inputMode="numeric"
            value={campos.cep}
            onChange={(e) => mudar('cep')(e.target.value)}
          />
          <Campo
            rotulo="Logradouro"
            className="sm:col-span-2"
            value={campos.logradouro}
            onChange={(e) => mudar('logradouro')(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            rotulo="Número"
            value={campos.numero}
            onChange={(e) => mudar('numero')(e.target.value)}
          />
          <Campo
            rotulo="Complemento"
            value={campos.complemento}
            onChange={(e) => mudar('complemento')(e.target.value)}
          />
          <Campo
            rotulo="Bairro"
            value={campos.bairro}
            onChange={(e) => mudar('bairro')(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            rotulo="Cidade"
            className="sm:col-span-2"
            value={campos.cidade}
            onChange={(e) => mudar('cidade')(e.target.value)}
          />
          <Campo
            rotulo="UF"
            maxLength={2}
            value={campos.uf}
            onChange={(e) => mudar('uf')(e.target.value.toUpperCase())}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-neutro-700">Responsável</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Responsável legal"
            required
            value={campos.responsavelLegal}
            onChange={(e) => mudar('responsavelLegal')(e.target.value)}
          />
          <Campo
            rotulo="CPF do responsável"
            inputMode="numeric"
            value={campos.cpfDoResponsavel}
            onChange={(e) => mudar('cpfDoResponsavel')(e.target.value)}
          />
        </div>
        <AreaDeTexto
          rotulo="Observações internas"
          ajuda="Só a Pharmopet lê. Não sai na receita."
          value={campos.observacoesInternas}
          onChange={(e) => mudar('observacoesInternas')(e.target.value)}
        />
      </fieldset>

      {erro ? (
        <p
          role="alert"
          className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
        >
          {erro}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Botao type="submit" disabled={enviando || !completo}>
          {enviando ? 'Salvando…' : rotuloDeEnvio}
        </Botao>
        {aoCancelar ? (
          <Botao tom="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
        ) : null}
      </div>
    </form>
  );
}

type Campos = Record<
  | 'razaoSocial'
  | 'nomeFantasia'
  | 'cnpj'
  | 'inscricaoEstadual'
  | 'email'
  | 'telefone'
  | 'whatsapp'
  | 'cep'
  | 'logradouro'
  | 'numero'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'responsavelLegal'
  | 'cpfDoResponsavel'
  | 'observacoesInternas',
  string
>;

/** `null` do servidor vira string vazia: um input controlado não aceita null. */
function valoresIniciais(clinica?: Clinica): Campos {
  return {
    razaoSocial: clinica?.razaoSocial ?? '',
    nomeFantasia: clinica?.nomeFantasia ?? '',
    cnpj: clinica?.cnpj ?? '',
    inscricaoEstadual: clinica?.inscricaoEstadual ?? '',
    email: clinica?.email ?? '',
    telefone: clinica?.telefone ?? '',
    whatsapp: clinica?.whatsapp ?? '',
    cep: clinica?.cep ?? '',
    logradouro: clinica?.logradouro ?? '',
    numero: clinica?.numero ?? '',
    complemento: clinica?.complemento ?? '',
    bairro: clinica?.bairro ?? '',
    cidade: clinica?.cidade ?? '',
    uf: clinica?.uf ?? '',
    responsavelLegal: clinica?.responsavelLegal ?? '',
    cpfDoResponsavel: clinica?.cpfDoResponsavel ?? '',
    observacoesInternas: clinica?.observacoesInternas ?? '',
  };
}

/**
 * E de volta: vazio vira `null`, e não string vazia.
 *
 * `telefone: ''` seria recusado pela validação de telefone do servidor, e um
 * `cidade: ''` viraria dado sujo que nenhuma busca acha. Ausência é ausência.
 */
function paraCorpo(campos: Campos): DadosDaClinica {
  const opcional = (v: string) => (v.trim() === '' ? null : v.trim());

  return {
    razaoSocial: campos.razaoSocial.trim(),
    nomeFantasia: campos.nomeFantasia.trim(),
    cnpj: campos.cnpj.trim(),
    inscricaoEstadual: opcional(campos.inscricaoEstadual),
    email: campos.email.trim(),
    telefone: opcional(campos.telefone),
    whatsapp: opcional(campos.whatsapp),
    cep: opcional(campos.cep),
    logradouro: opcional(campos.logradouro),
    numero: opcional(campos.numero),
    complemento: opcional(campos.complemento),
    bairro: opcional(campos.bairro),
    cidade: opcional(campos.cidade),
    uf: opcional(campos.uf),
    responsavelLegal: campos.responsavelLegal.trim(),
    cpfDoResponsavel: opcional(campos.cpfDoResponsavel),
    observacoesInternas: opcional(campos.observacoesInternas),
  };
}
