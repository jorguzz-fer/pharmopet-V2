import { useState, type FormEvent } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { lerPesoEmQuilos } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { mensagemDeErro } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';

type Paciente = components['schemas']['PacienteDto'];

export const ESPECIES = [
  { valor: 'CANINO', rotulo: 'Canino' },
  { valor: 'FELINO', rotulo: 'Felino' },
  { valor: 'EQUINO', rotulo: 'Equino' },
  { valor: 'AVE', rotulo: 'Ave' },
  { valor: 'ROEDOR', rotulo: 'Roedor' },
  { valor: 'REPTIL', rotulo: 'Réptil' },
] as const;

/**
 * Cadastro de paciente.
 *
 * Mora aqui, e não dentro da ficha do tutor, porque o wizard de receita
 * precisa do mesmo formulário: quem vai prescrever para um bicho que ainda
 * não está cadastrado não deve ter que sair do meio da receita, cadastrar em
 * outra tela e voltar — e um segundo formulário copiado seria um lugar a mais
 * para a validação de peso divergir.
 *
 * `aoCriar` recebe o paciente criado, e não só o aviso de que criou: quem
 * chama de dentro do wizard precisa do id para seguir para a prescrição.
 */
export function NovoPaciente({
  tutorId,
  aoCriar,
  rotuloDoBotao = 'Cadastrar paciente',
}: {
  tutorId: string;
  aoCriar: (paciente: Paciente) => void;
  rotuloDoBotao?: string;
}) {
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
      const criado = await exigir(
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
      aoCriar(criado);
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
        {enviando ? 'Salvando…' : rotuloDoBotao}
      </Botao>
    </form>
  );
}
