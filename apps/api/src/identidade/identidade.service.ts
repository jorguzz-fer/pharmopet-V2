import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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

  /** A equipe, em ordem de nome. Só o administrador chega aqui. */
  async listarUsuarios(filtro: { papel?: Papel; busca?: string }): Promise<Usuario[]> {
    const busca = filtro.busca?.trim();

    return this.prisma.usuario.findMany({
      where: {
        ...(filtro.papel ? { papel: filtro.papel } : {}),
        ...(busca
          ? {
              OR: [
                { nome: { contains: busca, mode: 'insensitive' } },
                { email: { contains: busca, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { nome: 'asc' },
      // Teto para a lista não virar varredura da base inteira numa instalação
      // grande. Quem procura alguém específico usa a busca.
      take: 200,
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

  /**
   * Corrige uma conta: nome, papel, CRMV, e ligar ou desligar.
   *
   * Desativar já valia antes desta rota existir — o login recusa e a sessão
   * aberta deixa de resolver no mesmo instante. O que faltava era o caminho
   * para acionar: `USUARIO_DESATIVADO` estava no enum de auditoria e nunca era
   * emitido, porque só o acesso direto ao banco desligava alguém.
   */
  async alterarUsuario(
    id: string,
    dados: { nome?: string; papel?: Papel; crmv?: string | null; desativado?: boolean },
    autor: { id: string } & Origem,
  ): Promise<Usuario> {
    const atual = await this.prisma.usuario.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Usuário não encontrado.');

    const papel = dados.papel ?? atual.papel;
    const estavaDesativado = atual.desativadoEm !== null;
    const desativado = dados.desativado ?? estavaDesativado;

    // Desligar a si mesmo é sair pela porta e jogar a chave dentro: a sessão
    // cai no mesmo instante, e o conserto passa a exigir o comando no servidor.
    if (desativado && id === autor.id) {
      throw new ConflictException('Você não pode desativar a própria conta.');
    }

    // O último administrador ativo não sai nem pelo desligamento nem pela troca
    // de papel. Sem ele ninguém administra a instalação, e a única saída é
    // `usuario:criar` com acesso ao servidor.
    const perdeOAdmin =
      atual.papel === 'ADMIN' && !estavaDesativado && (desativado || papel !== 'ADMIN');
    if (perdeOAdmin && (await this.outrosAdminsAtivos(id)) === 0) {
      throw new ConflictException(
        'Esta é a única conta de administração ativa. Promova ou crie outra antes.',
      );
    }

    const alterado = await this.prisma.usuario.update({
      where: { id },
      data: {
        ...(dados.nome !== undefined ? { nome: dados.nome.trim() } : {}),
        papel,
        // CRMV só faz sentido em quem prescreve. Deixá-lo pendurado num papel
        // que não assina receita guardaria credencial profissional numa conta
        // que não a exerce — e ela reapareceria numa promoção futura.
        crmv:
          papel === 'VETERINARIO'
            ? dados.crmv === undefined
              ? atual.crmv
              : dados.crmv?.trim() || null
            : null,
        ...(dados.desativado === undefined
          ? {}
          : // Religar limpa a data; desligar só marca se ainda não estava, para
            // reenviar o mesmo corpo não apagar quando a pessoa saiu.
            desativado
            ? { desativadoEm: atual.desativadoEm ?? new Date() }
            : { desativadoEm: null }),
      },
    });

    if (desativado !== estavaDesativado) {
      await this.auditoria.registrar({
        acao: 'USUARIO_DESATIVADO',
        usuarioId: autor.id,
        alvo: `usuario:${id}`,
        detalhe: { desativado },
        ip: autor.ip,
        agenteDeUsuario: autor.agenteDeUsuario,
      });
    }

    return alterado;
  }

  /** Quantos administradores ativos existem além deste. */
  private async outrosAdminsAtivos(exceto: string): Promise<number> {
    return this.prisma.usuario.count({
      where: { papel: 'ADMIN', desativadoEm: null, id: { not: exceto } },
    });
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
