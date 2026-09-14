import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ErroDeApi, exigir } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { Botao } from '@/componentes/Botao';
import { CampoDeSenha } from '@/componentes/CampoDeSenha';
import { Moldura } from '@/paginas/senha/Moldura';

/** O mínimo da API (`senhaSchema`). Repetido aqui só para avisar antes de enviar. */
const MINIMO = 12;

function mensagemDe(erro: unknown): string {
  if (erro instanceof ErroDeApi) {
    if (erro.status === 400)
      return 'A senha não foi aceita. Ela precisa ter 12 caracteres ou mais.';
    if (erro.status === 404) return 'Este link expirou ou já foi usado. Peça outro.';
    if (erro.status === 429) return 'Muitas tentativas. Espere um minuto e tente de novo.';
  }
  return 'Não foi possível falar com o sistema. Verifique a conexão.';
}

type Situacao = 'conferindo' | 'valido' | 'invalido' | 'trocada';

/**
 * Escolher a senha nova, pelo link do e-mail.
 *
 * Confere o link **antes** de mostrar o formulário. Sem isso, quem chega com um
 * link vencido escolhe uma senha, digita duas vezes, clica, e só então descobre
 * que precisa começar de novo — e nesse ponto já escolheu uma senha que não
 * existe em lugar nenhum.
 *
 * O token vem da query e não do caminho porque é assim que ele chega do e-mail;
 * não é guardado em lugar nenhum além do endereço da aba.
 */
export function RedefinirSenha() {
  const [parametros] = useSearchParams();
  const token = parametros.get('token') ?? '';

  const [situacao, setSituacao] = useState<Situacao>('conferindo');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (token === '') {
      setSituacao('invalido');
      return;
    }

    let atual = true;
    void exigir(api.GET('/api/v1/auth/senha/redefinir/{token}', { params: { path: { token } } }))
      .then(() => {
        if (atual) setSituacao('valido');
      })
      .catch(() => {
        // Qualquer falha aqui é "não dá para seguir": link gasto, vencido ou
        // API fora. Distinguir só mudaria o texto de uma tela cuja única saída
        // é pedir outro link.
        if (atual) setSituacao('invalido');
      });

    return () => {
      atual = false;
    };
  }, [token]);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();

    // Conferidas antes da ida ao servidor: são erros que a tela sabe apontar
    // sozinha, e mandar para a API só atrasaria a resposta.
    if (senha.length < MINIMO) {
      setErro(`A senha precisa de pelo menos ${MINIMO} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais.');
      return;
    }

    setErro(null);
    setEnviando(true);

    try {
      await exigir(api.POST('/api/v1/auth/senha/redefinir', { body: { token, senhaNova: senha } }));
      setSituacao('trocada');
    } catch (e) {
      setErro(mensagemDe(e));
      if (e instanceof ErroDeApi && e.status === 404) setSituacao('invalido');
    } finally {
      setEnviando(false);
      // A senha sai dos campos em qualquer desfecho: no sucesso ela não tem
      // mais uso na tela, e no erro deixá-la ali é uma janela a mais para
      // alguém ler por cima do ombro num balcão.
      setSenha('');
      setConfirmacao('');
    }
  }

  if (situacao === 'conferindo') {
    return (
      <Moldura titulo="Redefinir senha">
        <p className="mt-1 text-sm text-neutro-500">Conferindo o link…</p>
      </Moldura>
    );
  }

  if (situacao === 'invalido') {
    return (
      <Moldura titulo="Link inválido">
        <p role="alert" className="mt-1 text-sm text-neutro-700">
          Este link expirou ou já foi usado. Cada link vale por uma hora e só funciona uma vez.
        </p>
        <p className="mt-6 text-sm">
          <Link to="/esqueci-senha" className="font-semibold text-turquesa-700 underline">
            Pedir um link novo
          </Link>
        </p>
      </Moldura>
    );
  }

  if (situacao === 'trocada') {
    return (
      <Moldura titulo="Senha trocada">
        <p role="status" className="mt-1 text-sm text-neutro-700">
          Pronto. Entre com a senha nova.
        </p>
        {/*
          O aviso não é detalhe: trocar a senha derrubou toda sessão aberta,
          inclusive a de quem tenha entrado sem permissão — que costuma ser o
          motivo de alguém redefinir com pressa. Quem só esqueceu a senha
          precisa saber por que o celular pediu login de novo.
        */}
        <p className="mt-4 text-sm text-neutro-500">
          As sessões abertas em outros aparelhos foram encerradas.
        </p>
        <p className="mt-6 text-sm">
          <Link to="/entrar" className="font-semibold text-turquesa-700 underline">
            Ir para a entrada
          </Link>
        </p>
      </Moldura>
    );
  }

  return (
    <Moldura titulo="Escolha uma senha nova">
      <p className="mt-1 text-sm text-neutro-500">
        Pelo menos {MINIMO} caracteres. Uma frase que só você saiba vale mais do que símbolos.
      </p>

      <form onSubmit={aoEnviar} className="mt-6 flex flex-col gap-4" noValidate>
        <CampoDeSenha
          rotulo="Senha nova"
          name="senhaNova"
          autoComplete="new-password"
          autoFocus
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          ajuda={`Mínimo de ${MINIMO} caracteres.`}
        />

        <CampoDeSenha
          rotulo="Repita a senha nova"
          name="confirmacao"
          autoComplete="new-password"
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />

        {erro ? (
          <p
            role="alert"
            className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
          >
            {erro}
          </p>
        ) : null}

        <Botao type="submit" larguraTotal disabled={enviando}>
          {enviando ? 'Trocando…' : 'Trocar a senha'}
        </Botao>
      </form>
    </Moldura>
  );
}
