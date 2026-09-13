import { describe, expect, it } from 'vitest';
import { ErroDeApi } from '@pharmopet/api-client';
import { mensagemDeErro } from './consulta';

/** Como a API responde de verdade: status mais um corpo com `message`. */
function respondeu(status: number, message?: string): ErroDeApi {
  return new ErroDeApi(status, message === undefined ? undefined : { message });
}

describe('mensagemDeErro', () => {
  /**
   * 403 tem duas causas com remédios opostos — papel que não permite, e par
   * anti-CSRF que não fechou. A tela mostrava a mesma frase de permissão nos
   * dois casos, e um ADMIN foi procurar erro de papel num cookie ausente.
   */
  it('mostra a explicação do servidor no 403, e não uma frase de permissão fixa', () => {
    const erro = respondeu(
      403,
      'A verificação de segurança da sessão falhou. Recarregue a página e entre de novo.',
    );

    expect(mensagemDeErro(erro)).toContain('Recarregue a página');
  });

  it('ainda diz algo útil no 403 quando o servidor não explicou', () => {
    expect(mensagemDeErro(respondeu(403))).toBe('Seu perfil não tem acesso a esta ação.');
  });

  it('não inventa "não existe" no 404 — quase sempre é "não é seu"', () => {
    expect(mensagemDeErro(respondeu(404))).toBe('Não encontrado.');
  });

  it('distingue sessão expirada de falta de permissão', () => {
    expect(mensagemDeErro(respondeu(401))).toContain('sessão');
  });

  it('não chuta a causa quando não houve resposta nenhuma', () => {
    expect(mensagemDeErro(new TypeError('Failed to fetch'))).toContain('conexão');
  });
});
