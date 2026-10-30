import { FLOW_PERIOD } from '../physics/constants.ts'

/**
 * Sementes das duas cópias do ruído do gás no tempo t (mesma conta de
 * gasCopies em disk.glsl) e a semente que a próxima cópia a reiniciar vai
 * receber. A cópia 0 reinicia nos múltiplos de FLOW_PERIOD e a 1 meio período
 * depois; a mais velha é a próxima, com a semente dela mais 1.
 */
export function gasSeeds(time: number) {
  const cycle = time / FLOW_PERIOD
  const seed0 = Math.floor(cycle)
  const seed1 = Math.floor(cycle + 0.5) + 0.5
  const age0 = cycle - seed0
  const age1 = cycle + 0.5 - Math.floor(cycle + 0.5)
  return { seed0, seed1, next: age0 >= age1 ? seed0 + 1 : seed1 + 1 }
}
