// Testes do amortecimento da câmera em segundos. Rodar com `npm test`.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DAMPING_AT_60, DAMPING_RATE, dampingFactor, remainingGlide } from './cameraDamping.ts'

// O OrbitControls a cada quadro: aplica fator · resto e guarda o resto.
function glide(fps: number, seconds: number) {
  let rest = 1
  let applied = 0
  for (let i = 0; i < Math.round(fps * seconds); i++) {
    const f = dampingFactor(1 / fps)
    applied += f * rest
    rest *= 1 - f
  }
  return { rest, applied }
}

test('a 60 fps o fator é o de antes', () => {
  assert.ok(Math.abs(dampingFactor(1 / 60) - DAMPING_AT_60) < 1e-12)
})

test('o escorregão leva o mesmo tempo a 30, 60 e 144 fps', () => {
  const at60 = glide(60, 0.5).rest
  for (const fps of [30, 144]) assert.ok(Math.abs(glide(fps, 0.5).rest - at60) < 1e-9, `${fps} fps`)
  assert.ok(Math.abs(at60 - Math.exp(-DAMPING_RATE * 0.5)) < 1e-9)
})

test('o giro total é o do dedo, em qualquer fps', () => {
  for (const fps of [20, 30, 60, 165]) {
    const { rest, applied } = glide(fps, 10)
    assert.ok(Math.abs(applied + rest - 1) < 1e-12)
    assert.ok(rest < 1e-12)
  }
})

test('quadro longo (aba voltando) aplica o resto de uma vez, sem passar', () => {
  assert.ok(dampingFactor(10) <= 1)
  assert.ok(dampingFactor(10) > 0.999)
  assert.equal(dampingFactor(-1), 0)
})

test('o que falta escorregar é a velocidade dividida pelo ritmo de queda', () => {
  // Soma do que anda daqui em diante, quadro a quadro a 60 fps, a partir de 30 px/s.
  let speed = 30
  let total = 0
  for (let i = 0; i < 2000; i++) {
    const step = speed / 60
    total += step
    speed *= 1 - DAMPING_AT_60
  }
  assert.ok(Math.abs(total - remainingGlide(30)) / total < 0.05)
})
