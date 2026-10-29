// Testes da leitura da sonda de raio (SPEC 3.2). Rodar com `npm test`.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shadowAngle, periapsis } from './observables.ts'
import { readProbe } from './probe.ts'
import type { CameraState } from './trace.ts'
import { length, normalize, type Vec3 } from './vec3.ts'

// Câmera da vista inicial (22 r_s, 8° acima do disco) num buffer de 1281 x 721,
// para o pixel (640, 360) ficar exatamente no centro.
const W = 1281
const H = 721
const FOV = (45 * Math.PI) / 180

function camera(distance = 22, inclDeg = 8, lookAway = false): CameraState {
  const incl = (inclDeg * Math.PI) / 180
  const position: Vec3 = [0, distance * Math.sin(incl), distance * Math.cos(incl)]
  const sign = lookAway ? -1 : 1
  const back = normalize(position).map((c) => c * sign) as unknown as Vec3
  const right: Vec3 = [sign, 0, 0]
  const up: Vec3 = [0, Math.cos(incl), -Math.sin(incl)]
  return { position, matrix: [...right, 0, ...up, 0, ...back, 0, ...position, 1], fov: FOV, aspect: W / H }
}

const options = { maxSteps: 300, realism: 1 }

test('centro da sombra: horizonte, b perto de 0, sem menor distância nem desvio', () => {
  const r = readProbe(camera(), 640, 360, W, H, options)
  assert.equal(r.destination, 'horizon')
  assert.ok(r.b < 1e-6)
  assert.equal(r.minDistance, null)
  assert.equal(r.deflection, null)
})

test('disco da frente: destino disco, r entre 3 e 12, dados do gás coerentes', () => {
  // Abaixo do centro da tela, onde o disco passa na frente da sombra.
  const r = readProbe(camera(), 640, 320, W, H, options)
  assert.equal(r.destination, 'disk')
  const c = r.crossings[0]
  assert.ok(c.r > 3 && c.r < 12, `r = ${c.r}`)
  assert.ok(r.firstSpeed! > 0 && r.firstSpeed! <= 0.5)
  assert.ok(r.deflection! > 0 && r.deflection! < 90)
  assert.equal(r.diagram.crossings.length, r.crossings.length)
})

test('céu longe do buraco: menor distância igual ao periastro exato', () => {
  const r = readProbe(camera(), 1270, 700, W, H, options)
  assert.equal(r.destination, 'sky')
  assert.ok(r.deflection! > 0)
  assert.equal(r.minDistance, periapsis(r.b))
})

test('raio que para no disco antes do periastro: menor distância é o r do cruzamento', () => {
  const r = readProbe(camera(), 640, 320, W, H, options)
  assert.equal(r.destination, 'disk')
  assert.ok(Math.abs(r.minDistance! - r.crossings[0].r) < 1e-9, `${r.minDistance} contra ${r.crossings[0].r}`)
  // O caminho sólido do diagrama termina no ponto do disco.
  assert.deepEqual(r.diagram.path[r.diagram.path.length - 1], r.diagram.crossings[0])
})

test('câmera olhando para fora: a menor distância é a da própria câmera', () => {
  const r = readProbe(camera(22, 8, true), 640, 360, W, H, options)
  assert.equal(r.destination, 'sky')
  assert.ok(Math.abs(r.minDistance! - 22) < 1e-9)
})

test('ponto sensível só perto da borda da sombra', () => {
  // Pixel vertical cuja direção fica a um ângulo α do centro: tan α = (py + 0,5 - H/2) / (H/2) · tan(fov/2).
  const edgeOffset = (Math.tan(shadowAngle(22)) / Math.tan(FOV / 2)) * (H / 2)
  const atEdge = readProbe(camera(), 640, Math.round(360 + edgeOffset), W, H, options)
  const away = readProbe(camera(), 640, Math.round(360 + 3 * edgeOffset), W, H, options)
  assert.equal(atEdge.sensitive, true)
  assert.equal(away.sensitive, false)
})

test('diagrama: a câmera fica em (r, 0), o caminho começa nela e o disco vai de 3 a 12', () => {
  const r = readProbe(camera(), 640, 320, W, H, options)
  const d = r.diagram
  assert.ok(Math.abs(d.camera[0] - 22) < 1e-9 && Math.abs(d.camera[1]) < 1e-9)
  assert.deepEqual(d.path[0], d.camera)
  assert.ok(d.disk !== null)
  for (const [a, b] of d.disk!) {
    assert.ok(Math.abs(length([a[0], a[1], 0]) - 3) < 1e-9)
    assert.ok(Math.abs(length([b[0], b[1], 0]) - 12) < 1e-9)
  }
})
