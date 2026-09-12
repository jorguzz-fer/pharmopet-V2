import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Campo } from './Campo';

describe('Campo', () => {
  it('amarra o rótulo ao input, para o campo ter nome acessível', () => {
    render(<Campo rotulo="Peso do paciente" />);

    expect(screen.getByLabelText('Peso do paciente')).toBeInTheDocument();
  });

  it('descreve o campo pela ajuda quando não há erro', () => {
    render(<Campo rotulo="Peso do paciente" ajuda="Em quilos, com uma casa." />);

    expect(screen.getByLabelText('Peso do paciente')).toHaveAccessibleDescription(
      'Em quilos, com uma casa.',
    );
  });

  /**
   * O erro precisa chegar a quem não está olhando o campo. Sem o
   * aria-describedby a mensagem existe na tela e não existe para o leitor.
   */
  it('marca o campo como inválido e descreve o erro', () => {
    render(<Campo rotulo="CRMV" erro="Informe o estado do conselho." />);

    const input = screen.getByLabelText('CRMV');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Informe o estado do conselho.');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o estado do conselho.');
  });

  it('deixa o erro falar sozinho, sem a ajuda competindo', () => {
    render(<Campo rotulo="CRMV" ajuda="Só números." erro="Informe o estado do conselho." />);

    expect(screen.queryByText('Só números.')).not.toBeInTheDocument();
  });
});
