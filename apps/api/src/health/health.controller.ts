import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Publica } from '../identidade/decoradores';

/**
 * A resposta nasce de um schema Zod, não de uma classe nua.
 *
 * É o que a ADR 0006 fixou: um schema só, que serve à validação em runtime e
 * ao OpenAPI. Uma classe sem decorador sai no contrato como objeto vazio, e o
 * cliente gerado herda esse vazio — foi o que aconteceu na primeira geração.
 */
const saudeSchema = z
  .object({
    status: z.literal('ok'),
    timestamp: z.iso.datetime().describe('Momento da verificação, em ISO 8601 UTC'),
  })
  .describe('Sinal de vida da API');

export class SaudeDto extends createZodDto(saudeSchema) {}

@ApiTags('sistema')
@Controller('health')
export class HealthController {
  /**
   * Pública porque é o que o orquestrador consulta para decidir se o contêiner
   * está vivo — e ele não tem sessão. Não revela nada: só diz que o processo
   * responde, sem tocar banco nem contar o que há dentro.
   */
  @Publica()
  @Get()
  @ApiOperation({ summary: 'Liveness da API' })
  @ApiOkResponse({ type: SaudeDto })
  verificar(): SaudeDto {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
