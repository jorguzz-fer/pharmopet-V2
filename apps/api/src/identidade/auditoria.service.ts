import { Injectable, Logger } from '@nestjs/common';
import type { AcaoAuditada, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EventoParaRegistrar = {
  acao: AcaoAuditada;
  usuarioId?: string | null;
  alvo?: string | null;
  detalhe?: Prisma.InputJsonValue;
  ip?: string | null;
  agenteDeUsuario?: string | null;
};

/**
 * Trilha de auditoria.
 *
 * Só insere. Não existe aqui método de atualizar nem de apagar, e é de propósito:
 * a garantia de imutabilidade que o blueprint pede começa por não haver código
 * capaz de reescrever a linha.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra o evento.
   *
   * Falha ao auditar não derruba a operação auditada: recusar uma entrada legítima
   * porque o log não escreveu seria trocar um problema por outro pior. Mas também
   * não passa em silêncio — vai para o log da aplicação, onde o alerta enxerga.
   */
  async registrar(evento: EventoParaRegistrar): Promise<void> {
    try {
      await this.prisma.eventoDeAuditoria.create({
        data: {
          acao: evento.acao,
          usuarioId: evento.usuarioId ?? null,
          alvo: evento.alvo ?? null,
          detalhe: evento.detalhe,
          ip: evento.ip ?? null,
          agenteDeUsuario: evento.agenteDeUsuario ?? null,
        },
      });
    } catch (erro) {
      this.logger.error(
        `não consegui registrar o evento ${evento.acao}`,
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }
}
