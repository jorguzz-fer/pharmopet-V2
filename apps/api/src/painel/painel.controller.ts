import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Eu } from '../identidade/decoradores';
import type { UsuarioAutenticado } from '../identidade/sessao.service';
import { PainelDto } from './painel.dto';
import { PainelService } from './painel.service';

/**
 * O painel de quem entrou.
 *
 * Sem `@Papeis`: todo mundo que tem sessão tem painel. O que muda por papel é o
 * conteúdo, e quem decide isso é o serviço — a rota não precisa saber.
 */
@ApiTags('painel')
@Controller('painel')
export class PainelController {
  constructor(private readonly painel: PainelService) {}

  @Get()
  @ApiOperation({ summary: 'Métricas da tela inicial, conforme o papel' })
  @ApiOkResponse({ type: PainelDto })
  async montar(@Eu() eu: UsuarioAutenticado): Promise<PainelDto> {
    const painel = await this.painel.montar({ id: eu.id, papel: eu.papel });

    return {
      ...painel,
      // A data vira ISO aqui: `Date` é detalhe do Prisma e não atravessa a
      // borda do contrato. É a única conversão desta rota — o resto o serviço
      // já devolve na forma publicada.
      ultimas: painel.ultimas.map((r) => ({ ...r, criadaEm: r.criadaEm.toISOString() })),
    };
  }
}
