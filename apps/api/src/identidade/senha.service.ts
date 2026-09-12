import { Injectable } from '@nestjs/common';
import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * Hash de senha com Argon2id.
 *
 * Argon2id porque é o que o blueprint fixa e o que o OWASP recomenda: resiste
 * tanto a GPU quanto a ataque de canal lateral, coisa que bcrypt e PBKDF2 não
 * fazem ao mesmo tempo.
 *
 * Os parâmetros são os mínimos de referência do OWASP para Argon2id: 19 MiB de
 * memória, 2 iterações, paralelismo 1. Subir memória é o que mais encarece o
 * ataque, mas cada login também paga esse custo no servidor — daí o piso, e não
 * um número escolhido no chute.
 */
const PARAMETROS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class SenhaService {
  /** O texto devolvido já carrega algoritmo, parâmetros e sal. */
  async gerarHash(senha: string): Promise<string> {
    return hash(senha, PARAMETROS);
  }

  /**
   * Confere a senha contra o hash.
   *
   * Devolve `false` em vez de propagar erro quando o hash está corrompido ou em
   * formato desconhecido: para quem chama, isso é indistinguível de senha
   * errada, e é o que deve ser — um hash ilegível não pode virar uma entrada
   * aceita nem uma mensagem de erro que conte algo sobre a conta.
   */
  async conferir(hashArmazenado: string, senha: string): Promise<boolean> {
    try {
      return await verify(hashArmazenado, senha, PARAMETROS);
    } catch {
      return false;
    }
  }
}
