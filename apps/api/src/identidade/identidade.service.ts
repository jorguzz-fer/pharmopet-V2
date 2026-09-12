import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Papel, Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';
import { AuditoriaService } from './auditoria.service';
import { SenhaService } from './senha.service';
import { SessaoService, type SessaoCriada, type UsuarioAutenticado } from './sessao.service';
import { TENTATIVAS_ANTES_DE_BLOQUEAR, bloqueadoAte } from './bloqueio';

export type Origem = { ip?: string; agenteDeUsuario?: string };

/**
 * Casos de uso de identidade: entrar, sair, trocar senha, criar usuário.
 *
 * A regra que atravessa tudo aqui é não contar nada a quem está tentando: as
 * recusas saem idênticas, e o caminho que recusa gasta o mesmo tempo do caminho
 * que aceita.
 */
@Injectable()
export class IdentidadeService {
  private readonly logger = new Logger(IdentidadeService.name);
  private hashDeIsca: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly sessoes: SessaoService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Entrada no sistema.
   *
   * Toda recusa sai igual — mesma exceção, mesma mensagem — venha ela de e-mail
   * inexistente, senha errada, conta desativada ou conta bloqueada. Quem está
   * tentando adivinhar não deve conseguir separar esses casos; quem é dono da
   * conta descobre o motivo pelo canal certo, falando com o administrador.
   */
  async entrar(email: string, senha: string, origem: Origem): Promise<SessaoCriada> {
    const normalizado = email.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({ where: { email: normalizado } });

    if (!usuario) {
      // Gasta o mesmo tempo de uma conferência real antes de recusar.
      await this.senhas.conferir(await this.iscaDeTempo(), senha);
      await this.auditoria.registrar({
        acao: 'ENTRADA_RECUSADA',
        alvo: `email:${normalizado}`,
        detalhe: { motivo: 'inexistente' },
        ip: origem.ip,
        agenteDeUsuario: origem.agenteDeUsuario,
      });
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }

    if (usuario.desativadoEm !== null) {
      await this.senhas.conferir(await this.iscaDeTempo(), senha);
      await this.registrarRecusa(usuario.id, 'desativado', origem);
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }

    if (usuario.bloqueadoAte !== null && usuario.bloqueadoAte.getTime() > Date.now()) {
      await this.senhas.conferir(await this.iscaDeTempo(), senha);
      await this.registrarRecusa(usuario.id, 'bloqueado', origem);
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }

    const confere = await this.senhas.conferir(usuario.senhaHash, senha);
    if (!confere) {
      await this.contabilizarFalha(usuario, origem);
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }

    // Entrada aceita zera a escada de bloqueio: as tentativas erradas eram de
    // quem não tinha a senha, e não faz sentido penalizar quem tem.
    if (usuario.tentativasFalhas !== 0 || usuario.bloqueadoAte !== null) {
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { tentativasFalhas: 0, bloqueadoAte: null },
      });
    }

    const sessao = await this.sessoes.abrir(
      usuario.id,
      this.config.get('SESSAO_DURACAO_HORAS', { infer: true }),
      origem,
    );

    await this.auditoria.registrar({
      acao: 'ENTRADA_ACEITA',
      usuarioId: usuario.id,
      ip: origem.ip,
      agenteDeUsuario: origem.agenteDeUsuario,
    });

    return sessao;
  }

  async sair(usuario: UsuarioAutenticado, origem: Origem): Promise<void> {
    await this.sessoes.revogar(usuario.sessaoId);
    await this.auditoria.registrar({
      acao: 'SAIDA',
      usuarioId: usuario.id,
      ip: origem.ip,
      agenteDeUsuario: origem.agenteDeUsuario,
    });
  }

  /**
   * Troca de senha.
   *
   * Exige a senha atual mesmo com sessão válida: sessão aberta num computador
   * emprestado não deveria bastar para tomar a conta. E derruba todas as sessões,
   * inclusive a de quem está trocando — é o comportamento certo quando o motivo
   * da troca é justamente suspeitar que alguém mais está lá dentro.
   */
  async trocarSenha(
    usuario: UsuarioAutenticado,
    senhaAtual: string,
    senhaNova: string,
    origem: Origem,
  ): Promise<void> {
    const registro = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });

    if (!(await this.senhas.conferir(registro.senhaHash, senhaAtual))) {
      await this.registrarRecusa(usuario.id, 'senha_atual_incorreta', origem);
      throw new UnauthorizedException('Senha atual incorreta.');
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        senhaHash: await this.senhas.gerarHash(senhaNova),
        // Mesma escrita que invalida tudo que estava aberto.
        sessoesValidasDesde: new Date(),
        tentativasFalhas: 0,
        bloqueadoAte: null,
      },
    });

    await this.auditoria.registrar({
      acao: 'SENHA_ALTERADA',
      usuarioId: usuario.id,
      ip: origem.ip,
      agenteDeUsuario: origem.agenteDeUsuario,
    });
  }

  /** Cria um usuário. Só o administrador chega aqui, e o comando de bootstrap. */
  async criarUsuario(
    dados: { email: string; nome: string; papel: Papel; senha: string; crmv?: string | null },
    autor: { id: string | null } & Origem,
  ): Promise<Usuario> {
    const criado = await this.prisma.usuario.create({
      data: {
        email: dados.email.trim().toLowerCase(),
        nome: dados.nome.trim(),
        papel: dados.papel,
        crmv: dados.crmv?.trim() || null,
        senhaHash: await this.senhas.gerarHash(dados.senha),
      },
    });

    await this.auditoria.registrar({
      acao: 'USUARIO_CRIADO',
      usuarioId: autor.id,
      alvo: `usuario:${criado.id}`,
      detalhe: { papel: criado.papel },
      ip: autor.ip,
      agenteDeUsuario: autor.agenteDeUsuario,
    });

    return criado;
  }

  private async contabilizarFalha(usuario: Usuario, origem: Origem): Promise<void> {
    const falhas = usuario.tentativasFalhas + 1;
    const ate = bloqueadoAte(falhas, new Date());

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { tentativasFalhas: falhas, bloqueadoAte: ate },
    });

    await this.registrarRecusa(usuario.id, 'senha_incorreta', origem, { tentativa: falhas });

    if (ate !== null) {
      this.logger.warn(`conta ${usuario.id} bloqueada até ${ate.toISOString()} (${falhas} falhas)`);
      await this.auditoria.registrar({
        acao: 'CONTA_BLOQUEADA',
        usuarioId: usuario.id,
        detalhe: { tentativas: falhas, ate: ate.toISOString() },
        ip: origem.ip,
        agenteDeUsuario: origem.agenteDeUsuario,
      });
    } else if (falhas === TENTATIVAS_ANTES_DE_BLOQUEAR - 1) {
      this.logger.warn(`conta ${usuario.id} a uma tentativa do bloqueio`);
    }
  }

  private async registrarRecusa(
    usuarioId: string,
    motivo: string,
    origem: Origem,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.auditoria.registrar({
      acao: 'ENTRADA_RECUSADA',
      usuarioId,
      detalhe: { motivo, ...extra },
      ip: origem.ip,
      agenteDeUsuario: origem.agenteDeUsuario,
    });
  }

  /**
   * Hash descartável, usado só para gastar tempo quando não há o que conferir.
   *
   * Sem isto, recusar um e-mail inexistente sai em microssegundos e recusar uma
   * senha errada leva as dezenas de milissegundos do Argon2 — diferença
   * suficiente para varrer uma lista e descobrir quem tem conta aqui. Como o
   * veterinário é identificado pelo e-mail profissional, isso vazaria a própria
   * carteira de clientes da farmácia.
   *
   * É o hash de um UUID aleatório, calculado na primeira vez que faz falta: não
   * abre conta nenhuma, e conferir contra ele custa o mesmo que conferir de
   * verdade.
   */
  private async iscaDeTempo(): Promise<string> {
    this.hashDeIsca ??= await this.senhas.gerarHash(randomUUID());
    return this.hashDeIsca;
  }
}
