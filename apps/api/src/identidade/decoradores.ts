import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Papel } from '@prisma/client';
import type { RequisicaoComUsuario } from './requisicao';
import type { UsuarioAutenticado } from './sessao.service';

export const CHAVE_PUBLICA = 'rota:publica';
export const CHAVE_PAPEIS = 'rota:papeis';

/**
 * Abre a rota para quem não entrou.
 *
 * Existe porque o padrão é o contrário: sem sessão, a requisição não passa. Uma
 * rota que esquece de se declarar fica protegida, que é o erro barato. O erro
 * caro — expor sem querer — exige escrever isto aqui, e isso aparece na revisão.
 */
export const Publica = () => SetMetadata(CHAVE_PUBLICA, true);

/** Restringe a rota aos papéis listados. Sem isto, basta estar autenticado. */
export const Papeis = (...papeis: Papel[]) => SetMetadata(CHAVE_PAPEIS, papeis);

/** Injeta o usuário já resolvido pelo guard de sessão. */
export const Eu = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoComUsuario>();

    if (!requisicao.usuario) {
      // Só acontece se alguém usar @Eu() numa rota marcada como pública. É erro
      // de programação, não de quem chamou — falhar alto é o certo.
      throw new Error('@Eu() usado numa rota sem sessão obrigatória.');
    }

    return requisicao.usuario;
  },
);
