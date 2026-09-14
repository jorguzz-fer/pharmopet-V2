import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { IdMalformadoFiltro } from './id-malformado.filtro';

/**
 * A ramificação do filtro, testada de perto.
 *
 * Precisa ser unitário: por HTTP não há como provar a metade de baixo. Os
 * serviços já convertem os erros conhecidos do Prisma — índice único vira
 * `ConflictException` no próprio serviço —, então nenhum outro chega até aqui
 * hoje, e um filtro que engolisse tudo passaria despercebido por qualquer
 * teste de rota. O dia em que um escapar, é este teste que garante que ele
 * não vira 400 em silêncio.
 */
function erroDoPrisma(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('mensagem interna do Prisma', {
    code,
    clientVersion: '6.0.0',
  });
}

describe('filtro de id malformado', () => {
  const host = {} as ArgumentsHost;
  let delegou: jest.SpyInstance;
  let filtro: IdMalformadoFiltro;

  beforeEach(() => {
    delegou = jest.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => {});
    filtro = new IdMalformadoFiltro();
  });

  afterEach(() => {
    delegou.mockRestore();
  });

  it('P2023 vira 400, com mensagem própria', () => {
    filtro.catch(erroDoPrisma('P2023'), host);

    const [entregue] = delegou.mock.calls[0] as [unknown];

    expect(entregue).toBeInstanceOf(BadRequestException);
    expect((entregue as BadRequestException).message).toBe('Identificador inválido.');
  });

  it('a mensagem interna do Prisma não é repassada', () => {
    filtro.catch(erroDoPrisma('P2023'), host);

    const [entregue] = delegou.mock.calls[0] as [Error];

    expect(entregue.message).not.toContain('mensagem interna do Prisma');
  });

  /**
   * O que o defeito de "engolir tudo" quebra. Sem este teste, trocar a
   * condição por algo sempre verdadeiro passava em toda a suíte.
   */
  it.each(['P2002', 'P2003', 'P2025', 'P1001'])(
    'o erro %p passa intacto, e não vira 400',
    (code) => {
      const original = erroDoPrisma(code);

      filtro.catch(original, host);

      const [entregue] = delegou.mock.calls[0] as [unknown];

      expect(entregue).toBe(original);
      expect(entregue).not.toBeInstanceOf(BadRequestException);
    },
  );
});
