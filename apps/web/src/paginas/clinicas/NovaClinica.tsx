import { useNavigate } from 'react-router';
import { exigir } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { mensagemDeErro } from '@/api/consulta';
import { Cartao } from '@/componentes/Cartao';
import { FormularioDeClinica, type DadosDaClinica } from './FormularioDeClinica';

/**
 * Cadastro de clínica parceira.
 *
 * Nasce PENDENTE, por decisão do servidor: quem cadastra nem sempre é quem
 * aprova, e uma clínica que já entra valendo emitiria receita antes de o
 * contrato existir.
 */
export function NovaClinica() {
  const navegar = useNavigate();

  async function criar(dados: DadosDaClinica) {
    try {
      const criada = await exigir(api.POST('/api/v1/clinicas', { body: dados }));
      navegar(`/clinicas/${criada.id}`);
    } catch (e) {
      // Vira Error com a frase da API: o formulário mostra `e.message`.
      throw new Error(mensagemDeErro(e));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Nova clínica</h1>

      <Cartao>
        <FormularioDeClinica
          rotuloDeEnvio="Cadastrar"
          aoEnviar={criar}
          aoCancelar={() => navegar('/clinicas')}
        />
      </Cartao>
    </div>
  );
}
