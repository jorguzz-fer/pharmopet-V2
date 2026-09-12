import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env';
import { Eu, Papeis, Publica } from './decoradores';
import { CriarUsuarioDto, EntrarDto, EuDto, TrocarSenhaDto } from './identidade.dto';
import { IdentidadeService } from './identidade.service';
import { COOKIE_CSRF, COOKIE_SESSAO, origemDa } from './requisicao';
import type { UsuarioAutenticado } from './sessao.service';

@ApiTags('identidade')
@Controller('auth')
export class IdentidadeController {
  constructor(
    private readonly identidade: IdentidadeService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Limite por IP, somado ao bloqueio por conta. As duas defesas cobrem ataques
   * diferentes: o bloqueio por conta impede martelar uma senha, e o limite por
   * IP impede varrer muitas contas com a mesma senha comum — que passaria pelo
   * primeiro sem nunca somar cinco falhas em conta nenhuma.
   *
   * Dez por minuto, e não cinco, porque a clínica inteira sai por um IP só: com
   * cinco, três pessoas chegando juntas de manhã — uma delas errando a senha
   * duas vezes — trancariam a porta uma para a outra. Dez ainda deixa a varredura
   * lenta a ponto de não valer a pena.
   */
  @Publica()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('entrar')
  @HttpCode(204)
  @ApiOperation({ summary: 'Abre uma sessão' })
  @ApiNoContentResponse({ description: 'Sessão aberta; os cookies vão na resposta.' })
  @ApiUnauthorizedResponse({ description: 'E-mail ou senha incorretos.' })
  async entrar(
    @Body() corpo: EntrarDto,
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<void> {
    const sessao = await this.identidade.entrar(corpo.email, corpo.senha, origemDa(requisicao));

    resposta.cookie(COOKIE_SESSAO, sessao.token, this.opcoesDoCookie(sessao.expiraEm, true));
    resposta.cookie(COOKIE_CSRF, sessao.csrfToken, this.opcoesDoCookie(sessao.expiraEm, false));
  }

  @Post('sair')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra a sessão atual' })
  @ApiNoContentResponse({ description: 'Sessão encerrada.' })
  async sair(
    @Eu() usuario: UsuarioAutenticado,
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<void> {
    await this.identidade.sair(usuario, origemDa(requisicao));

    // Mesmas opções da definição, senão o navegador não reconhece o cookie
    // como o mesmo e o antigo continua lá.
    resposta.clearCookie(COOKIE_SESSAO, this.opcoesDoCookie(new Date(0), true));
    resposta.clearCookie(COOKIE_CSRF, this.opcoesDoCookie(new Date(0), false));
  }

  @Get('eu')
  @ApiOperation({ summary: 'Quem está logado' })
  @ApiOkResponse({ type: EuDto })
  eu(@Eu() usuario: UsuarioAutenticado): EuDto {
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
      crmv: usuario.crmv,
    };
  }

  @Post('senha')
  @HttpCode(204)
  @ApiOperation({ summary: 'Troca a própria senha e derruba as outras sessões' })
  @ApiNoContentResponse({ description: 'Senha trocada; é preciso entrar de novo.' })
  @ApiUnauthorizedResponse({ description: 'Senha atual incorreta.' })
  async trocarSenha(
    @Eu() usuario: UsuarioAutenticado,
    @Body() corpo: TrocarSenhaDto,
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<void> {
    await this.identidade.trocarSenha(
      usuario,
      corpo.senhaAtual,
      corpo.senhaNova,
      origemDa(requisicao),
    );

    // A sessão de quem trocou também morreu. Limpar o cookie evita a tela ficar
    // se achando logada e levar 401 na próxima chamada.
    resposta.clearCookie(COOKIE_SESSAO, this.opcoesDoCookie(new Date(0), true));
    resposta.clearCookie(COOKIE_CSRF, this.opcoesDoCookie(new Date(0), false));
  }

  @Papeis('ADMIN')
  @Post('usuarios')
  @ApiOperation({ summary: 'Cria um usuário' })
  @ApiCreatedResponse({ type: EuDto })
  @ApiForbiddenResponse({ description: 'Só administrador cria usuário.' })
  async criarUsuario(
    @Eu() autor: UsuarioAutenticado,
    @Body() corpo: CriarUsuarioDto,
    @Req() requisicao: Request,
  ): Promise<EuDto> {
    const criado = await this.identidade.criarUsuario(corpo, {
      id: autor.id,
      ...origemDa(requisicao),
    });

    return {
      id: criado.id,
      nome: criado.nome,
      email: criado.email,
      papel: criado.papel,
      crmv: criado.crmv,
    };
  }

  /**
   * `httpOnly` vale só para o cookie de sessão: o anti-CSRF precisa ser lido
   * pelo JavaScript da página para voltar no cabeçalho. Ele não dá acesso a
   * nada sozinho — sem o cookie de sessão, que o JavaScript não alcança, o
   * token anti-CSRF é inútil.
   */
  private opcoesDoCookie(expiraEm: Date, httpOnly: boolean): CookieOptions {
    return {
      httpOnly,
      secure: this.config.get('COOKIE_SEGURO', { infer: true }),
      // `strict` quebraria a volta de um link externo; `lax` já impede o envio
      // em POST de outra origem, que é o vetor de CSRF que importa.
      sameSite: 'lax',
      path: '/',
      expires: expiraEm,
    };
  }
}
