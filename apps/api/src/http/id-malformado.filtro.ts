import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * O código do Prisma para "o valor não cabe na coluna".
 *
 * É o que sai quando um `:id` da URL não é um UUID e chega numa coluna
 * `@db.Uuid`: o Postgres recusa a conversão antes de procurar qualquer linha.
 */
const VALOR_INCOMPATIVEL = 'P2023';

/**
 * Id malformado responde 400, e não 500.
 *
 * Antes disto, `GET /receituario/receitas/naoeuuid` devolvia **500**: o erro
 * de conversão do Prisma subia como falha interna. Três problemas nisso, em
 * ordem de importância:
 *
 * 1. **Mente sobre de quem é a culpa.** 500 diz "nós quebramos"; o que houve
 *    foi um id que não é id. Quem integra fica procurando bug no servidor.
 * 2. **Polui o log.** Um link velho ou um `undefined` numa URL viram stack
 *    trace de erro interno, e erro interno é o que alguém monitora.
 * 3. **Some no meio do ruído.** Quando um 500 de verdade acontecer, ele estará
 *    na mesma pilha dos ids torto.
 *
 * 400 e não 404, apesar de a ADR 0011 mandar 404 para o que existe e não é
 * seu: ali o 404 protege — confirmar existência entrega a carteira de
 * clientes. Aqui não há o que proteger, porque um texto que não é UUID não é
 * o id de ninguém. Dizer "isto não é um id" não vaza nada e poupa a busca.
 *
 * Filtro global, e não `ParseUUIDPipe` em cada rota: pipe é coisa que se
 * esquece de pôr na rota seguinte, e o esquecimento volta a dar 500. É o
 * mesmo raciocínio da negação por padrão nos guards.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class IdMalformadoFiltro extends BaseExceptionFilter implements ExceptionFilter {
  override catch(erro: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    if (erro.code === VALOR_INCOMPATIVEL) {
      // A mensagem do Prisma cita tabela e coluna — detalhe interno que não
      // ajuda quem chamou e descreve o schema para quem estiver sondando.
      super.catch(new BadRequestException('Identificador inválido.'), host);
      return;
    }

    // Todo o resto segue o caminho de sempre. Este filtro tem um trabalho só;
    // mapear mais códigos aqui esconderia erros que devem aparecer como 500
    // até alguém decidir o que fazer com eles.
    super.catch(erro, host);
  }
}
