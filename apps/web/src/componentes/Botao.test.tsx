import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Botao } from './Botao';

describe('Botao', () => {
  /**
   * Dentro de um form, um button sem `type` é submit. Um "Adicionar
   * ingrediente" enviaria a receita inteira — daí o padrão explícito.
   */
  it('não é submit por acidente', () => {
    render(<Botao>Adicionar ingrediente</Botao>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('deixa a tela pedir submit quando é isso que ela quer', () => {
    render(<Botao type="submit">Salvar</Botao>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('não dispara a ação quando desabilitado', async () => {
    const aoClicar = vi.fn();
    render(
      <Botao disabled onClick={aoClicar}>
        Remover
      </Botao>,
    );

    await userEvent.click(screen.getByRole('button'), { pointerEventsCheck: 0 });

    expect(aoClicar).not.toHaveBeenCalled();
  });

  it('dispara a ação no clique', async () => {
    const aoClicar = vi.fn();
    render(<Botao onClick={aoClicar}>Nova receita</Botao>);

    await userEvent.click(screen.getByRole('button', { name: 'Nova receita' }));

    expect(aoClicar).toHaveBeenCalledOnce();
  });
});
