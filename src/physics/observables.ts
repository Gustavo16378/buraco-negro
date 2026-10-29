// Grandezas físicas derivadas, nas mesmas fórmulas do shader (SPEC, seção 2).
// Unidades geométricas: r_s = 1, M = 0,5, tempo em r_s / c.

import { B_C, C, DISK_FADE_IN, DISK_FADE_OUT, G, M_SUN, T_PROFILE_PEAK } from './constants.ts'
import { dot, length, normalize, scale, sub, type Vec3 } from './vec3.ts'

/** Como o smoothstep do GLSL. */
export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Raio angular da sombra (rad) para um observador parado a r: sen α = (b_c / r) · sqrt(1 - 1/r). */
export function shadowAngle(r: number) {
  return Math.asin((B_C / r) * Math.sqrt(1 - 1 / r))
}

/**
 * Parâmetro de impacto do raio que sai da posição x na direção n, medida pela
 * câmera parada ali: b = r · sen α / sqrt(1 - 1/r), com α o ângulo entre n e
 * a direção radial.
 */
export function impactParameter(x: Vec3, n: Vec3) {
  const r = length(x)
  const rhat = scale(x, 1 / r)
  const tangential = sub(normalize(n), scale(rhat, dot(normalize(n), rhat)))
  return (r * length(tangential)) / Math.sqrt(1 - 1 / r)
}

/**
 * Menor distância ao centro de uma órbita de luz com parâmetro de impacto b:
 * a raiz maior de 1/b² = 1/r² - 1/r³. Devolve null se b ≤ b_c (a luz cai).
 * Para r > 1,5 o lado direito só diminui, então a raiz fica entre 1,5 e b e
 * sai por bisseção.
 */
export function periapsis(b: number) {
  if (b <= B_C) return null
  const target = 1 / (b * b)
  let lo = 1.5
  let hi = b
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (1 / (mid * mid) - 1 / (mid * mid * mid) > target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Ritmo do tempo de um observador parado em r, comparado com um distante: sqrt(1 - 1/r). */
export function timeDilation(r: number) {
  return Math.sqrt(1 - 1 / r)
}

/** Opacidade do disco em r: sobe na borda interna e cai na externa (opaco no meio). */
export function diskAlpha(r: number, diskIn: number, diskOut: number) {
  return smoothstep(diskIn, diskIn + DISK_FADE_IN, r) * (1 - smoothstep(diskOut - DISK_FADE_OUT, diskOut, r))
}

/** Temperatura de disco fino em r, com pico igual a peak (kelvin). */
export function diskTemperature(r: number, diskIn: number, peak: number) {
  const x = r / diskIn
  return (peak * Math.pow(x, -0.75) * Math.pow(Math.max(1 - 1 / Math.sqrt(x), 0), 0.25)) / T_PROFILE_PEAK
}

/** Velocidade orbital do gás em r, medida por um observador parado ali, em fração de c. */
export function orbitalSpeed(r: number) {
  return Math.sqrt(0.5 / (r - 1))
}

/**
 * Fator de desvio de frequência g = ν_observado / ν_emitido da luz que sai do
 * gás em p (no plano do disco, a r do centro) e chega à câmera a camDist.
 * rayDir é a direção do raio traçado (da câmera para o gás) no cruzamento.
 * Doppler relativístico vezes desvio gravitacional, como no shader.
 */
export function frequencyShift(p: Vec3, r: number, rayDir: Vec3, camDist: number) {
  const beta = orbitalSpeed(r)
  const gamma = 1 / Math.sqrt(1 - beta * beta)
  const t = normalize([-p[2], 0, p[0]])
  const n = scale(rayDir, -1)
  const doppler = 1 / (gamma * (1 - beta * dot(t, n)))
  const grav = Math.sqrt(1 - 1 / r) / Math.sqrt(1 - 1 / camDist)
  return doppler * grav
}

// Escala física: a massa só converte r_s e r_s / c em unidades do dia a dia.

/** Raio de Schwarzschild, em km, de um buraco negro com essa quantidade de massas solares. */
export function schwarzschildRadiusKm(solarMasses: number) {
  return (2 * G * M_SUN * solarMasses) / (C * C) / 1000
}

/** Duração de uma unidade de tempo da simulação (r_s / c), em segundos. */
export function timeUnitSeconds(solarMasses: number) {
  return (2 * G * M_SUN * solarMasses) / (C * C * C)
}
