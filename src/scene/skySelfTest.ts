// Autoteste do céu (?debug): cópia em JavaScript do hash, do ruído e do fbm
// do shader (blackhole.frag.glsl), para conferir se a GPU do aparelho calcula
// igual. Se o hash inteiro sair diferente, estrelas e Via Láctea saem erradas.

/** Entrada fixa do hash (uvec3) e ponto fixo do ruído, os mesmos que vão ao shader como uniforms. */
export const SELF_TEST_HASH_INPUT = [12345, 67890, 13579] as const
export const SELF_TEST_POINT = [3.7, 11.2, 25.9] as const

type U3 = [number, number, number]

// PCG3D em aritmética de 32 bits sem sinal, como o uint do GLSL.
function pcg3d([a, b, c]: U3): U3 {
  let x = (Math.imul(a, 1664525) + 1013904223) >>> 0
  let y = (Math.imul(b, 1664525) + 1013904223) >>> 0
  let z = (Math.imul(c, 1664525) + 1013904223) >>> 0
  x = (x + Math.imul(y, z)) >>> 0
  y = (y + Math.imul(z, x)) >>> 0
  z = (z + Math.imul(x, y)) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  y = (y ^ (y >>> 16)) >>> 0
  z = (z ^ (z >>> 16)) >>> 0
  x = (x + Math.imul(y, z)) >>> 0
  y = (y + Math.imul(z, x)) >>> 0
  z = (z + Math.imul(x, y)) >>> 0
  return [x, y, z]
}

export function hash31(p: U3) {
  return pcg3d(p)[0] / 4294967295
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t

export function noise3([px, py, pz]: readonly [number, number, number]) {
  const i: U3 = [Math.floor(px) + 4096, Math.floor(py) + 4096, Math.floor(pz) + 4096]
  const f = [px - Math.floor(px), py - Math.floor(py), pz - Math.floor(pz)]
  const u = f.map((v) => v * v * (3 - 2 * v))
  const h = (dx: number, dy: number, dz: number) => hash31([i[0] + dx, i[1] + dy, i[2] + dz])
  return mix(
    mix(mix(h(0, 0, 0), h(1, 0, 0), u[0]), mix(h(0, 1, 0), h(1, 1, 0), u[0]), u[1]),
    mix(mix(h(0, 0, 1), h(1, 0, 1), u[0]), mix(h(0, 1, 1), h(1, 1, 1), u[0]), u[1]),
    u[2],
  )
}

export function fbm(point: readonly [number, number, number], octaves: number) {
  let p = [...point] as [number, number, number]
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let k = 0; k < octaves; k++) {
    sum += amp * noise3(p)
    norm += amp
    p = [p[0] * 2.03 + 17.1, p[1] * 2.03 + 17.1, p[2] * 2.03 + 17.1]
    amp *= 0.5
  }
  return sum / norm
}

/** Valores esperados do autoteste: hash, ruído e fbm (5 oitavas) nas entradas fixas. */
export function selfTestExpected() {
  return {
    hash: hash31([...SELF_TEST_HASH_INPUT]),
    noise: noise3(SELF_TEST_POINT),
    fbm: fbm(SELF_TEST_POINT, 5),
  }
}
