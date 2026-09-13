import type { Usuario } from './SessaoContexto';

export type Papel = Usuario['papel'];

/**
 * O nome de cada papel para quem lê a tela.
 *
 * `Record<Papel, string>` de propósito, e não um objeto solto: quando um papel
 * novo entra no contrato — foi o que aconteceu com CLINICA — o compilador
 * aponta este arquivo em vez de a tela mostrar `undefined` em produção.
 */
export const rotuloDoPapel: Record<Papel, string> = {
  ADMIN: 'Administração',
  VETERINARIO: 'Veterinário',
  FARMACIA: 'Farmácia',
  CLINICA: 'Clínica',
};
