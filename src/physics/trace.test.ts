// Testes numéricos do integrador na CPU (SPEC 3.1). Rodar com `npm test`.

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { B_C, ISCO_PERIOD, MASSES, shaderDefines } from './constants.ts'
import {
  frequencyShift,
  impactParameter,
  periapsis,
  schwarzschildRadiusKm,
  shadowAngle,
  timeDilation,
  timeUnitSeconds,
} from './observables.ts'
import { pixelDirection, traceRay, type CameraState } from './trace.ts'
import { angleBetween, normalize, sub, type Vec3 } from './vec3.ts'

const relErr = (a: number, b: number) => Math.abs(a / b - 1)
const deg = (rad: number) => (rad * 180) / Math.PI

// Maior ângulo (a partir da direção do centro) em que o raio ainda cai, por bisseção.
function shadowEdge(r0: number) {
  const origin: Vec3 = [0, 0, r0]
  let lo = 0
  let hi = Math.PI / 2
  for (let k = 0; k < 50; k++) {
    const a = (lo + hi) / 2
    const res = traceRay(origin, [Math.sin(a), 0, -Math.cos(a)], { maxSteps: 300, realism: 0, disk: false })
    if (res.destination === 'horizon') lo = a
    else hi = a
  }
  return (lo + hi) / 2
}

// Câmera da vista inicial: 22 r_s, 8° acima do disco, olhando para o centro.
function initialCamera(): CameraState {
  const incl = (8 * Math.PI) / 180
  const position: Vec3 = [0, 22 * Math.sin(incl), 22 * Math.cos(incl)]
  const back = normalize(position)
  const right: Vec3 = [1, 0, 0]
  const up: Vec3 = [0, Math.cos(incl), -Math.sin(incl)]
  // matrixWorld por colunas: direita, cima, para trás, posição.
  const matrix = [...right, 0, ...up, 0, ...back, 0, ...position, 1]
  return { position, matrix, fov: (45 * Math.PI) / 180, aspect: 16 / 9 }
}

test('borda da sombra bate com a fórmula do observador parado (erro < 0,01%)', () => {
  for (const r of [6, 20, 22, 60]) {
    const err = relErr(shadowEdge(r), shadowAngle(r))
    assert.ok(err < 1e-4, `r = ${r}: erro de ${(err * 100).toFixed(5)}%`)
  }
  assert.equal(deg(shadowAngle(20)).toFixed(2), '7.27')
})

test('o raio na borda da sombra tem parâmetro de impacto b_c', () => {
  for (const r of [6, 22]) {
    const a = shadowEdge(r)
    const b = impactParameter([0, 0, r], [Math.sin(a), 0, -Math.cos(a)])
    assert.ok(relErr(b, B_C) < 1e-4, `r = ${r}: b = ${b}`)
  }
})

test('menor distância para b = 3, 5 e 10 (valores do SPEC)', () => {
  assert.equal(periapsis(3)?.toFixed(4), '2.2267')
  assert.equal(periapsis(5)?.toFixed(4), '4.3944')
  assert.equal(periapsis(10)?.toFixed(4), '9.4565')
  assert.equal(periapsis(2.5), null)
})

test('a menor distância do caminho traçado fica a menos de 1% da exata', () => {
  const r0 = 22
  for (const b of [3, 5, 10]) {
    const sinA = (b * Math.sqrt(1 - 1 / r0)) / r0
    const n: Vec3 = [sinA, 0, -Math.sqrt(1 - sinA * sinA)]
    const res = traceRay([0, 0, r0], n, { maxSteps: 300, realism: 0, disk: false })
    const exact = periapsis(b)!
    assert.ok(res.minR >= exact * (1 - 1e-6), `b = ${b}: ${res.minR} abaixo da exata ${exact}`)
    assert.ok(relErr(res.minR, exact) < 0.01, `b = ${b}: ${res.minR} contra ${exact}`)
  }
})

test('g na ISCO com a câmera a 22 r_s fica entre 0,4825 e 1,4475', () => {
  const p: Vec3 = [3, 0, 0]
  let min = Infinity
  let max = -Infinity
  // Direções espalhadas por igual na esfera (espiral de Fibonacci).
  const N = 4000
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N
    const s = Math.sqrt(1 - y * y)
    const phi = i * 2.399963229728653
    const g = frequencyShift(p, 3, [Math.cos(phi) * s, y, Math.sin(phi) * s], 22)
    min = Math.min(min, g)
    max = Math.max(max, g)
  }
  assert.ok(min >= 0.4825 - 1e-4 && max <= 1.4475 + 1e-4, `[${min}, ${max}]`)
  // Os extremos acontecem com a luz saindo na direção do movimento do gás e na contrária.
  assert.equal(frequencyShift(p, 3, [0, 0, -1], 22).toFixed(4), '1.4475')
  assert.equal(frequencyShift(p, 3, [0, 0, 1], 22).toFixed(4), '0.4825')
})

test('dilatação do tempo a 22 r_s = 0,977008', () => {
  assert.equal(timeDilation(22).toFixed(6), '0.977008')
})

test('conversões de massa batem com a tabela do SPEC', () => {
  assert.equal(schwarzschildRadiusKm(MASSES.sun).toFixed(4), '2.9533')
  assert.equal((timeUnitSeconds(MASSES.sun) * 1e6).toFixed(4), '9.8513')
  assert.ok(relErr(22 * schwarzschildRadiusKm(MASSES.gargantua), 6.5e9) < 1e-3)
  assert.equal(((ISCO_PERIOD * timeUnitSeconds(MASSES.sgrA)) / 60).toFixed(1), '32.6')
  assert.equal(((ISCO_PERIOD * timeUnitSeconds(MASSES.m87)) / 86400).toFixed(1), '34.2')
})

test('o pixel central olha para o centro e cai no horizonte', () => {
  const cam = initialCamera()
  const n = pixelDirection(cam, 640, 360, 1281, 721)
  assert.ok(angleBetween(n, normalize(sub([0, 0, 0], cam.position))) < 1e-9)
  const res = traceRay(cam.position, n, { maxSteps: 300, realism: 1 })
  assert.equal(res.destination, 'horizon')
  assert.ok(impactParameter(cam.position, n) < 1e-6)
})

test('um raio mirado no disco da frente para no disco', () => {
  const cam = initialCamera()
  const n = normalize(sub([0, 0, 8], cam.position))
  const real = traceRay(cam.position, n, { maxSteps: 300, realism: 1 })
  assert.equal(real.destination, 'disk')
  assert.ok(real.opacity > 0.99)
  const c = real.crossings[0]
  assert.ok(c.r > 3 && c.r < 12, `r = ${c.r}`)
  assert.equal(c.gApplied, c.gPhysical)
  assert.ok(Math.abs(c.tObserved - c.gApplied * c.tEmitted) < 1e-9)
  // No modo Interstellar o caminho é o mesmo, mas sem desvio de frequência.
  const film = traceRay(cam.position, n, { maxSteps: 300, realism: 0 })
  assert.equal(film.crossings[0].gApplied, 1)
  assert.equal(film.crossings[0].tObserved, film.crossings[0].tEmitted)
})

// Desvio exato (graus) de um raio que sai de r0 rumo ao centro com parâmetro
// de impacto b > b_c, pela integral da órbita: dφ = du / sqrt(1/b² - u² + u³),
// da câmera até o periastro e de lá até o infinito. Com u = u_p - w², a
// integral fica sem a singularidade no periastro.
function exactDeflection(r0: number, b: number) {
  const G = (u: number) => 1 / (b * b) - u * u + u * u * u
  const up = 1 / periapsis(b)!
  const atPeriapsis = 2 / Math.sqrt(2 * up - 3 * up * up) // limite de 2w / sqrt(G) quando w → 0
  const integral = (ua: number) => {
    const W = Math.sqrt(up - ua)
    const N = 20000 // Simpson
    let s = 0
    for (let i = 0; i <= N; i++) {
      const w = (W * i) / N
      const f = i === 0 ? atPeriapsis : (2 * w) / Math.sqrt(Math.max(G(up - w * w), 1e-300))
      s += f * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2)
    }
    return (s * W) / N / 3
  }
  const phiInfinity = integral(1 / r0) + integral(0)
  // Câmera em (r0, 0); a direção vista sai rumo ao centro, inclinada para +y.
  const sinA = (b * Math.sqrt(1 - 1 / r0)) / r0
  const n: Vec3 = [-Math.sqrt(1 - sinA * sinA), sinA, 0]
  return { n, deflection: deg(angleBetween(n, [Math.cos(phiInfinity), Math.sin(phiInfinity), 0])) }
}

test('o desvio do raio traçado bate com a integral exata da órbita (diferença < 0,1°)', () => {
  const r0 = 22
  for (const b of [3, 5, 10, 15]) {
    const { n, deflection } = exactDeflection(r0, b)
    const res = traceRay([r0, 0, 0], n, { maxSteps: 300, realism: 0, disk: false })
    assert.equal(res.destination, 'sky')
    const traced = deg(angleBetween(n, res.finalDirection))
    // O traçado para em r = 60; o pouco que a luz ainda curvaria dali ao infinito entra na tolerância.
    assert.ok(Math.abs(traced - deflection) < 0.1, `b = ${b}: traçado ${traced.toFixed(3)}°, exato ${deflection.toFixed(3)}°`)
  }
})

test('o shader usa as constantes compartilhadas e não redefine nenhuma', () => {
  const dir = new URL('../shaders/', import.meta.url)
  const shader = readdirSync(dir)
    .filter((f) => f.endsWith('.glsl'))
    .map((f) => readFileSync(new URL(f, dir), 'utf8'))
    .join('\n')
  for (const name of Object.keys(shaderDefines)) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(shader), `${name} não aparece no shader`)
    assert.ok(!new RegExp(`(const|#define)\\s+(float\\s+|int\\s+)?${name}\\b`).test(shader), `${name} redefinida no shader`)
  }
})
