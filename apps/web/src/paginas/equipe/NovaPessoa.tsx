import { useState } from 'react';
import { exigir } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { mensagemDeErro } from '@/api/consulta';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { PAPEIS, SeletorDePapel } from './SeletorDePapel';

type Papel = (typeof PAPEIS)[number];

/**
 * Alfabeto sem os pares que se confundem: 0/O, 1/l/I.
 *
 * Esta senha vai ser lida em voz alta ou copiada à mão de uma tela para outra —
 * é esse o caminho dela. Um "l" que a pessoa digita como "1" vira um chamado de
 * suporte que parece bloqueio de conta.
 */
const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Senha sorteada no navegador, com entropia de sobra.
 *
 * Vinte caracteres deste alfabeto dão cerca de 116 bits — muito acima do
 * mínimo de doze caracteres que a API exige. Sorteada, e não escolhida pelo
 * administrador, porque senha que uma pessoa inventa para outra costuma ser
 * "Pharmo2026" — e porque o administrador não deve ter escolhido a senha que a
 * pessoa vai usar.
 *
 * `crypto.getRandomValues` e não `Math.random`: o segundo é previsível, e uma
 * senha previsível não é senha.
 */
function sortearSenha(): string {
  const bytes = new Uint32Array(20);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

export function NovaPessoa({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: () => void }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('VETERINARIO');
  const [crmv, setCrmv] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** A senha sorteada, guardada só até a pessoa fechar o aviso. */
  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null);

  const pronto = nome.trim().length >= 2 && email.trim().includes('@');

  async function criar() {
    if (!pronto) return;

    const senha = sortearSenha();
    setErro(null);
    setSalvando(true);
    try {
      await exigir(
        api.POST('/api/v1/auth/usuarios', {
          body: {
            nome: nome.trim(),
            email: email.trim().toLowerCase(),
            papel,
            senha,
            crmv: papel === 'VETERINARIO' ? crmv.trim() || null : null,
          },
        }),
      );
      // Só guarda: avisar o pai aqui fecharia este cartão, e com ele a única
      // exibição da senha. Quem encerra o fluxo é o "Já anotei".
      setCriada({ email: email.trim().toLowerCase(), senha });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  // Depois de criada, a tela vira o recibo da senha — e só ele. A conta já
  // existe; o que resta é a única chance de ler a senha.
  if (criada !== null) {
    return (
      <Cartao titulo="Conta criada">
        <div className="flex flex-col gap-4">
          <Aviso tom="atencao">
            Esta senha aparece <strong>uma vez só</strong>. Copie agora e entregue à pessoa por um
            canal que não seja esta tela. Ela deve trocá-la na primeira entrada.
          </Aviso>

          <dl className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-sm text-neutro-500">E-mail</dt>
              <dd className="font-mono text-sm text-neutro-900">{criada.email}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-sm text-neutro-500">Senha</dt>
              <dd className="font-mono text-base font-semibold text-neutro-900 select-all">
                {criada.senha}
              </dd>
            </div>
          </dl>

          {/* Fecha e recarrega a lista: é aqui que o fluxo termina, e não na
              resposta da API — a conta já existe desde lá. */}
          <Botao onClick={aoCriar}>Já anotei</Botao>
        </div>
      </Cartao>
    );
  }

  return (
    <Cartao titulo="Nova pessoa">
      <div className="flex flex-col gap-4">
        {erro ? (
          <p
            role="alert"
            className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
          >
            {erro}
          </p>
        ) : null}

        <Campo rotulo="Nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo
          rotulo="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          ajuda="É por ele que a pessoa entra, e depois de criado não muda."
        />

        <SeletorDePapel valor={papel} aoMudar={setPapel} />

        {papel === 'VETERINARIO' ? (
          <Campo
            rotulo="CRMV"
            placeholder="SP 28.114"
            value={crmv}
            onChange={(e) => setCrmv(e.target.value)}
            ajuda="Pode ficar para depois, mas sem ele a receita sai sem o registro de quem assina."
          />
        ) : null}

        <p className="text-sm text-neutro-500">
          A senha é sorteada e aparece uma vez só depois de salvar — ninguém escolhe a senha de
          outra pessoa.
        </p>

        <div className="flex flex-wrap gap-2">
          <Botao onClick={criar} disabled={!pronto || salvando}>
            {salvando ? 'Criando…' : 'Criar conta'}
          </Botao>
          <Botao tom="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
        </div>
      </div>
    </Cartao>
  );
}
