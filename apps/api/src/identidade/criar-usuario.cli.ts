import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import type { Papel } from '@prisma/client';

/**
 * Cria um usuário pela linha de comando.
 *
 * Existe por causa do problema do primeiro usuário: criar usuário exige ser
 * administrador, e no banco vazio não há nenhum. As saídas usuais são piores —
 * uma conta padrão no seed é uma credencial conhecida esperando em produção, e
 * uma rota "criar o primeiro admin" fica aberta para sempre, dependendo de uma
 * checagem de "já tem alguém?" que é corrida de ninguém.
 *
 * Aqui a criação exige acesso ao servidor. Quem consegue rodar isto já tem o
 * banco.
 *
 *   pnpm --filter @pharmopet/api usuario:criar \
 *     --email fulano@clinica.com --nome "Fulano" --papel ADMIN
 *
 * A senha não vem por argumento: linha de comando vai para o histórico do shell
 * e aparece na lista de processos. Ou entra por PHARMOPET_SENHA, ou o comando
 * gera uma e mostra uma única vez.
 */

const PAPEIS: readonly Papel[] = ['ADMIN', 'VETERINARIO', 'FARMACIA', 'CLINICA'];

function senhaAleatoria(): string {
  // 24 bytes em base64url: ~192 bits, longe do alcance de qualquer força bruta.
  return randomBytes(24).toString('base64url');
}

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      nome: { type: 'string' },
      papel: { type: 'string' },
      crmv: { type: 'string' },
    },
  });

  const faltando = (['email', 'nome', 'papel'] as const).filter((c) => !values[c]);
  if (faltando.length > 0) {
    throw new Error(`Faltou informar: ${faltando.join(', ')}.`);
  }

  const papel = values.papel as Papel;
  if (!PAPEIS.includes(papel)) {
    throw new Error(`Papel inválido: ${values.papel}. Use um de ${PAPEIS.join(', ')}.`);
  }

  const senhaInformada = process.env.PHARMOPET_SENHA;
  const senha = senhaInformada ?? senhaAleatoria();

  if (senhaInformada && senhaInformada.length < 12) {
    throw new Error('PHARMOPET_SENHA precisa de pelo menos 12 caracteres.');
  }

  const { AppModule } = await import('../app.module');
  const { IdentidadeService } = await import('./identidade.service');

  const contexto = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
    abortOnError: false,
  });

  try {
    const identidade = contexto.get(IdentidadeService);
    const criado = await identidade.criarUsuario(
      {
        email: values.email as string,
        nome: values.nome as string,
        papel,
        senha,
        crmv: values.crmv ?? null,
      },
      // Sem autor: foi o operador do servidor, não um usuário do sistema. A
      // trilha registra a criação com autor nulo, que é a verdade.
      { id: null },
    );

    process.stdout.write(`\nUsuário criado: ${criado.email} (${criado.papel})\n`);

    if (!senhaInformada) {
      process.stdout.write(`Senha gerada:   ${senha}\n`);
      process.stdout.write('\nAnote agora: ela não é recuperável, só substituível.\n');
    }
  } finally {
    await contexto.close();
  }
}

principal().catch((erro: unknown) => {
  process.stderr.write(`\n${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
});
