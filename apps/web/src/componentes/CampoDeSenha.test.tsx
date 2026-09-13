import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CampoDeSenha } from './CampoDeSenha';

/**
 * A senha desta aplicação é digitada em pé, num balcão, e num teclado de celular
 * que corrige sozinho. Sem conferir o que digitou, a pessoa erra cinco vezes e a
 * conta bloqueia — o bloqueio progressivo não distingue quem ataca de quem tem
 * dedo gordo.
 */
describe('campo de senha', () => {
  it('nasce escondido: quem precisa ver clica', () => {
    render(<CampoDeSenha rotulo="Senha" />);

    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  });

  it('mostra e esconde de novo', async () => {
    render(<CampoDeSenha rotulo="Senha" />);

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  });

  /**
   * O botão vive dentro de um `form`, e o padrão de um botão lá dentro é
   * `submit`. Sem `type="button"`, clicar no olho tentaria entrar com a senha
   * pela metade — e no login isso conta uma tentativa errada.
   */
  it('não envia o formulário ao clicar no olho', async () => {
    const aoEnviar = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={aoEnviar}>
        <CampoDeSenha rotulo="Senha" />
        <button type="submit">Entrar</button>
      </form>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));

    expect(aoEnviar).not.toHaveBeenCalled();
  });

  it('não perde o que já foi digitado ao alternar', async () => {
    render(<CampoDeSenha rotulo="Senha" />);
    const campo = screen.getByLabelText('Senha');
    await userEvent.type(campo, 'uma senha bem longa');

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));

    expect(screen.getByLabelText('Senha')).toHaveValue('uma senha bem longa');
  });

  it('amarra o erro ao campo, para o leitor de tela ler a correção', () => {
    render(<CampoDeSenha rotulo="Senha" erro="A senha precisa de pelo menos 12 caracteres." />);
    const campo = screen.getByLabelText('Senha');

    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('A senha precisa de pelo menos 12 caracteres.');
  });

  it('amarra a ajuda quando não há erro', () => {
    render(<CampoDeSenha rotulo="Senha" ajuda="Pelo menos 12 caracteres." />);

    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('Pelo menos 12 caracteres.');
  });

  it('deixa o autoComplete passar, para o gerenciador de senhas funcionar', () => {
    render(<CampoDeSenha rotulo="Senha" autoComplete="current-password" />);

    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password');
  });
});
