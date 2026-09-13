import { useState, type FormEvent } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { mensagemDeErro } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';

type Tutor = components['schemas']['TutorDto'];

/**
 * Cadastro de tutor.
 *
 * Mora aqui, e não dentro da tela de tutores, porque o wizard de receita
 * precisa do mesmo formulário — e um segundo formulário copiado seria um
 * lugar a mais para o tratamento de campo vazio divergir.
 *
 * `aoCriar` recebe o tutor criado: quem chama de dentro do wizard precisa do
 * id para seguir para o paciente.
 */
export function NovoTutor({
  aoCriar,
  comMoldura = true,
  rotuloDoBotao = 'Cadastrar',
}: {
  aoCriar: (tutor: Tutor) => void;
  /** A tela de tutores já traz o próprio cartão; o wizard desenha o dele. */
  comMoldura?: boolean;
  rotuloDoBotao?: string;
}) {
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState({
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const criado = await exigir(
        api.POST('/api/v1/receituario/tutores', {
          // Campo vazio vira ausência, e não string vazia: um CPF "" seria
          // recusado pela validação, e um telefone "" viraria dado sujo.
          body: {
            nome: nome.trim(),
            ...(cpf.trim() ? { cpf: cpf.trim() } : {}),
            ...(telefone.trim() ? { telefone: telefone.trim() } : {}),
            ...somenteOsPreenchidos(endereco),
          },
        }),
      );
      aoCriar(criado);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  const formulario = (
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

      <fieldset className="flex flex-col gap-4 border-t border-neutro-100 pt-4">
        <legend className="sr-only">Endereço de entrega</legend>
        <p className="text-sm font-semibold text-neutro-700">Endereço de entrega</p>
        <p className="-mt-3 text-xs text-neutro-500">
          É para onde a farmácia manda quando a entrega não for na clínica. Pode ficar para depois,
          mas sem ele não dá para enviar o pedido ao tutor.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            rotulo="CEP"
            inputMode="numeric"
            value={endereco.cep}
            onChange={(e) => setEndereco({ ...endereco, cep: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Campo
              rotulo="Logradouro"
              value={endereco.logradouro}
              onChange={(e) => setEndereco({ ...endereco, logradouro: e.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            rotulo="Número"
            value={endereco.numero}
            onChange={(e) => setEndereco({ ...endereco, numero: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Campo
              rotulo="Complemento"
              value={endereco.complemento}
              onChange={(e) => setEndereco({ ...endereco, complemento: e.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            rotulo="Bairro"
            value={endereco.bairro}
            onChange={(e) => setEndereco({ ...endereco, bairro: e.target.value })}
          />
          <Campo
            rotulo="Cidade"
            value={endereco.cidade}
            onChange={(e) => setEndereco({ ...endereco, cidade: e.target.value })}
          />
          <Campo
            rotulo="UF"
            maxLength={2}
            value={endereco.uf}
            onChange={(e) => setEndereco({ ...endereco, uf: e.target.value.toUpperCase() })}
          />
        </div>
      </fieldset>

      {erro ? (
        <p
          role="alert"
          className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
        >
          {erro}
        </p>
      ) : null}

      <Botao type="submit" disabled={enviando || nome.trim().length < 2}>
        {enviando ? 'Salvando…' : rotuloDoBotao}
      </Botao>
    </form>
  );

  return comMoldura ? <Cartao titulo="Novo tutor">{formulario}</Cartao> : formulario;
}

/**
 * Só os campos que a pessoa preencheu.
 *
 * Mandar `cep: ''` seria gravar string vazia onde o modelo quer ausência — e
 * "endereço com CEP vazio" é o tipo de dado que faz a tela de entrega achar
 * que há endereço quando não há.
 */
function somenteOsPreenchidos(endereco: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(endereco)
      .map(([chave, valor]) => [chave, valor.trim()])
      .filter(([, valor]) => valor !== ''),
  );
}
