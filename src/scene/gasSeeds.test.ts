// Testes da troca de campos de ruído do gás. Rodar com `npm test`.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FLOW_PERIOD } from '../physics/constants.ts'
import { gasSeeds } from './gasSeeds.ts'

test('a semente preparada é a que a próxima cópia recebe ao reiniciar', () => {
  const step = 0.01
  for (let t = 0; t < 4 * FLOW_PERIOD; t += 0.37) {
    const now = gasSeeds(t)
    // Anda até alguma das duas sementes mudar.
    let later = now
    let u = t
    while (later.seed0 === now.seed0 && later.seed1 === now.seed1) {
      u += step
      later = gasSeeds(u)
    }
    const changed = later.seed0 !== now.seed0 ? later.seed0 : later.seed1
    assert.equal(changed, now.next, `t = ${t}`)
    // Só uma cópia reinicia por vez, e a outra continua com o mesmo campo.
    assert.ok(later.seed0 === now.seed0 || later.seed1 === now.seed1, `t = ${t}`)
  }
})

test('as duas cópias nunca usam a mesma semente', () => {
  for (let t = 0; t < 4 * FLOW_PERIOD; t += 0.37) {
    const { seed0, seed1, next } = gasSeeds(t)
    assert.notEqual(seed0, seed1)
    assert.ok(next !== seed0 && next !== seed1)
  }
})
