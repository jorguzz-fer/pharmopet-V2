import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('responde ok com timestamp ISO', async () => {
    const mod = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const resposta = mod.get(HealthController).verificar();

    expect(resposta.status).toBe('ok');
    expect(() => new Date(resposta.timestamp).toISOString()).not.toThrow();
  });
});
