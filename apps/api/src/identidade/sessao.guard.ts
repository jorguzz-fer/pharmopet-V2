import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHAVE_PUBLICA } from './decoradores';
import { CABECALHO_CSRF, COOKIE_SESSAO, type RequisicaoComUsuario } from './requisicao';
import { SessaoService } from './sessao.service';

/** Métodos que só leem. Não mudam estado, então não carregam risco de CSRF. */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Exige sessão válida, e exige o par anti-CSRF em tudo que muda estado.
 *
 * Registrado globalmente: toda rota nasce protegida, e abrir uma é um ato
 * explícito com `@Publica()`. O contrário — proteger uma a uma — depende de
 * ninguém esquecer, e alguém sempre esquece.
 */
@Injectable()
export class SessaoGuard implements CanActivate {
  constructor(
    private readonly sessoes: SessaoService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publica) return true;

    const requisicao = contexto.switchToHttp().getRequest<RequisicaoComUsuario>();
    const token = (requisicao.cookies as Record<string, string> | undefined)?.[COOKIE_SESSAO];

    if (!token) throw new UnauthorizedException('Sessão ausente ou expirada.');

    const usuario = await this.sessoes.resolver(token);
    if (!usuario) throw new UnauthorizedException('Sessão ausente ou expirada.');

    // O cookie viaja sozinho num POST feito por outro site. O cabeçalho não: só
    // JavaScript da nossa origem consegue definí-lo, e só ele lê o cookie de
    // onde o valor sai. Conferir os dois é o que fecha essa porta.
    if (!METODOS_SEGUROS.has(requisicao.method)) {
      const recebido = requisicao.get(CABECALHO_CSRF);
      if (!this.sessoes.confereCsrf(usuario.csrfToken, recebido)) {
        throw new ForbiddenException('Verificação anti-CSRF falhou.');
      }
    }

    requisicao.usuario = usuario;
    return true;
  }
}
