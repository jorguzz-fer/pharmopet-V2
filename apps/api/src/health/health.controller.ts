import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

class HealthResposta {
  status!: 'ok';
  timestamp!: string;
}

@ApiTags('sistema')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness da API' })
  @ApiOkResponse({ type: HealthResposta })
  verificar(): HealthResposta {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
