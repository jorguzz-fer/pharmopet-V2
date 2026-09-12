import type { INestApplication } from '@nestjs/common';
import { IdentidadeService } from './identidade.service';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, ipDeTeste, limparBanco, subirAplicacao } from '../teste/ambiente';

/**
 * O bloqueio por conta e o limite por IP defendem de ataques diferentes, e o
 * segundo costuma ser o esquecido: sem ele, varrer mil contas com a senha
 * "primavera2026" nunca soma cinco falhas em conta nenhuma e passa batido.
 *
 * Este é o único teste que compartilha um IP entre requisições — é justamente o
 * que se quer medir aqui.
 */
describe('limite de requisições por origem', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await subirAplicacao());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await limparBanco(prisma);
  });

  it('corta a varredura depois de dez tentativas da mesma origem', async () => {
    const identidade = app.get(IdentidadeService);
    for (let i = 0; i < 12; i++) {
      await identidade.criarUsuario(
        {
          email: `vitima${i}@clinica.test`,
          nome: 'Vítima',
          papel: 'VETERINARIO',
          senha: 'uma senha bem longa',
        },
        { id: null },
      );
    }

    const atacante = cliente(app, ipDeTeste());
    const respostas: number[] = [];

    // Uma conta diferente a cada tentativa: nenhuma acumula falha, e o bloqueio
    // por conta jamais dispararia. Só o limite por origem enxerga isto.
    for (let i = 0; i < 12; i++) {
      const resposta = await atacante
        .post('/api/v1/auth/entrar')
        .send({ email: `vitima${i}@clinica.test`, senha: 'primavera2026' });
      respostas.push(resposta.status);
    }

    expect(respostas.slice(0, 10)).toEqual(Array<number>(10).fill(401));
    expect(respostas.slice(10)).toEqual([429, 429]);
  });

  it('não pune outra origem pelo excesso da primeira', async () => {
    const identidade = app.get(IdentidadeService);
    await identidade.criarUsuario(
      {
        email: 'vet@clinica.test',
        nome: 'Dra. Renata',
        papel: 'VETERINARIO',
        senha: 'uma senha bem longa',
      },
      { id: null },
    );

    const barulhento = cliente(app, ipDeTeste());
    for (let i = 0; i < 11; i++) {
      await barulhento.post('/api/v1/auth/entrar').send({ email: 'x@y.test', senha: 'errada' });
    }

    // A clínica inteira sai por um IP só, mas clínicas diferentes não. Se o
    // limite fosse global, um ataque em qualquer lugar derrubaria todo mundo.
    const outraClinica = cliente(app, ipDeTeste());
    await outraClinica
      .post('/api/v1/auth/entrar')
      .send({ email: 'vet@clinica.test', senha: 'uma senha bem longa' })
      .expect(204);
  });
});
