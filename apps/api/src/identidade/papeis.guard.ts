import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Papel } from '@prisma/client';
import { CHAVE_PAPEIS, CHAVE_PUBLICA } from './decoradores';
import type { RequisicaoComUsuario } from './requisicao';

/**
 * Autorização por papel, com menor privilégio.
 *
 * Roda depois do guard de sessão, então aqui já existe usuário. Quem não tem o
 * papel leva 403 e não 404: esconder a existência da rota não protegeria nada
 * — ela está no contrato OpenAPI, que é público para quem entrou — e 404 só
 * confundiria o diagnóstico de um erro de permissão legítimo.
 */
@Injectable()
export class PapeisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const publica = this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publica) return true;

    const exigidos = this.reflector.getAllAndOverride<Papel[]>(CHAVE_PAPEIS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!exigidos || exigidos.length === 0) return true;

    const requisicao = contexto.switchToHttp().getRequest<RequisicaoComUsuario>();
    const usuario = requisicao.usuario;

    if (!usuario) {
      // Ordem de guards quebrada. Recusar é o certo: seguir em frente aqui
      // significaria autorizar sem saber quem é.
      throw new ForbiddenException('Sem identidade resolvida.');
    }

    if (!exigidos.includes(usuario.papel)) {
      throw new ForbiddenException('Seu papel não permite esta ação.');
    }

    return true;
  }
}
