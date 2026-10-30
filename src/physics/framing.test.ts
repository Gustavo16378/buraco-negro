// Testes do enquadramento conforme a proporção da tela. Rodar com `npm test`.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DISK_FADE_OUT, DISK_OUT } from './constants.ts'
import { LANDSCAPE_DIST, MIN_FOV, PORTRAIT_DIST, diskEdgeAngle, framingDistance, framingFov } from './framing.ts'
import { shadowAngle } from './observables.ts'

const rad = (deg: number) => (deg * Math.PI) / 180

test('tela deitada fica como sempre: 22 r_s e 45°', () => {
  assert.equal(framingDistance(16 / 9), LANDSCAPE_DIST)
  assert.equal(framingDistance(1), LANDSCAPE_DIST)
  assert.equal(framingFov(16 / 9, LANDSCAPE_DIST), MIN_FOV)
})

test('em pé: 35 r_s e o disco ocupando 120% da largura', () => {
  assert.equal(framingDistance(412 / 915), PORTRAIT_DIST)
  assert.equal(framingDistance(0.6), PORTRAIT_DIST)
  // Valores calculados na Etapa 5.1 para as telas de referência.
  assert.ok(Math.abs(framingFov(412 / 915, PORTRAIT_DIST) - 63.7) < 0.3)
  assert.ok(Math.abs(framingFov(360 / 690, PORTRAIT_DIST) - 56.4) < 0.3)
})

test('em pé, a sombra tem ~54 px de raio numa tela de 412 x 915', () => {
  const fov = rad(framingFov(412 / 915, PORTRAIT_DIST))
  const radius = (Math.tan(shadowAngle(PORTRAIT_DIST)) / Math.tan(fov / 2)) * (915 / 2)
  assert.ok(Math.abs(radius - 54) < 1, `${radius.toFixed(1)} px`)
})

test('entre deitada e em pé, a distância muda aos poucos', () => {
  const d = framingDistance(0.8)
  assert.ok(d > LANDSCAPE_DIST && d < PORTRAIT_DIST)
})

test('com a lente, a ponta do disco aparece mais longe do centro que sem ela', () => {
  // A luz que passa a ~11 r_s desvia ~2 / b ≈ 0,18 rad em direção ao buraco:
  // para chegar à ponta, o raio sai mais aberto. A ponta visível fica onde a
  // opacidade cai à metade, entre a borda do miolo opaco e a borda externa.
  const edgeR = DISK_OUT - DISK_FADE_OUT / 2
  for (const distance of [22, 35]) {
    const ratio = diskEdgeAngle(distance) / Math.atan(edgeR / distance)
    assert.ok(ratio > 1 && ratio < 1.1, `${distance} r_s: ${ratio.toFixed(3)}`)
  }
})
