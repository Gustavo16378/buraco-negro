// Traçado de um raio na CPU, cópia fiel do que o shader faz em cada pixel
// (blackhole.frag.glsl), em float64. Qualquer mudança no traçado do shader
// tem que ser repetida aqui; as constantes já vêm do mesmo lugar.

import {
  DISK_IN,
  DISK_OUT,
  DISK_TEMP,
  DT_FACTOR,
  ESCAPE_R,
  MAX_DT,
  MAX_LOOP_STEPS,
  MIN_DT,
  OPACITY_STOP,
} from './constants.ts'
import { diskAlpha, diskTemperature, frequencyShift } from './observables.ts'
import { add, addScaled, cross, dot, length, mix, normalize, scale, type Vec3 } from './vec3.ts'

/** Estado da câmera como o shader recebe: posição, matrixWorld (16 números, por colunas), fov vertical (rad), largura / altura. */
export type CameraState = {
  position: Vec3
  matrix: ArrayLike<number>
  fov: number
  aspect: number
}

export type TraceOptions = {
  /** Limite de passos em uso no shader (uMaxSteps). */
  maxSteps: number
  /** Andamento da troca de modo em uso (uRealismo): 0 = Interstellar, 1 = Física real. */
  realism: number
  /** Disco ligado. Padrão: sim. */
  disk?: boolean
  diskIn?: number
  diskOut?: number
  /** Temperatura de pico do disco (uTemp), em kelvin. */
  temp?: number
  /** Continua o caminho depois do ponto onde o shader para (para desenhar o resto, esmaecido). */
  continueAfterStop?: boolean
}

/** Um cruzamento do raio com o disco que contribui para a cor do pixel. */
export type Crossing = {
  point: Vec3
  r: number
  /** Direção do raio traçado no cruzamento (da câmera para o gás). */
  direction: Vec3
  /** Opacidade do disco nesse ponto. */
  alpha: number
  /** g calculado (Doppler vezes gravitacional) e g aplicado no modo atual. */
  gPhysical: number
  gApplied: number
  /** Temperatura emitida pelo gás e a observada (g aplicado vezes a emitida), em kelvin. */
  tEmitted: number
  tObserved: number
}

export type Destination = 'horizon' | 'disk' | 'sky'

export type TraceResult = {
  /** Onde o shader para: disco opaco, horizonte ou céu (inclui passos esgotados). */
  destination: Destination
  crossings: Crossing[]
  /** Opacidade acumulada do disco na frente do destino. */
  opacity: number
  /** Menor distância ao centro entre os pontos do caminho até a parada. */
  minR: number
  /** Direção do raio na parada; no céu, é de onde a luz vem. */
  finalDirection: Vec3
  /** Passos até a parada. */
  steps: number
  /** Posições: a câmera e o fim de cada passo. */
  path: Vec3[]
  /** Índice em path onde o shader para. */
  stopIndex: number
  /** Com continueAfterStop: para onde o caminho completo vai. */
  endDestination?: 'horizon' | 'sky'
}

/**
 * Direção do pixel (px, py) no referencial da câmera, como o shader monta.
 * px, py: pixel do drawing buffer com origem no canto inferior esquerdo (como
 * gl_FragCoord); width, height: tamanho do drawing buffer.
 */
export function pixelDirection(camera: CameraState, px: number, py: number, width: number, height: number): Vec3 {
  const ux = ((px + 0.5) / width) * 2 - 1
  const uy = ((py + 0.5) / height) * 2 - 1
  const t = Math.tan(camera.fov / 2)
  const local: Vec3 = [ux * t * camera.aspect, uy * t, -1]
  // mat3(matrixWorld) * local: as três primeiras colunas da matriz.
  const m = camera.matrix
  return normalize([
    m[0] * local[0] + m[4] * local[1] + m[8] * local[2],
    m[1] * local[0] + m[5] * local[1] + m[9] * local[2],
    m[2] * local[0] + m[6] * local[1] + m[10] * local[2],
  ])
}

/**
 * Direção que a câmera vê (n) para a direção inicial do raio no espaço da
 * integração: a componente radial encolhe por sqrt(1 - 1/r) (observador parado).
 */
export function observerToRay(n: Vec3, x: Vec3): Vec3 {
  const r = length(x)
  const rhat = scale(x, 1 / r)
  const nr = dot(n, rhat)
  return normalize(addScaled(n, rhat, (Math.sqrt(1 - 1 / r) - 1) * nr))
}

function accel(x: Vec3, h2: number): Vec3 {
  const r2 = dot(x, x)
  return scale(x, (-1.5 * h2) / (r2 * r2 * Math.sqrt(r2)))
}

function rk4(x: Vec3, v: Vec3, h2: number, dt: number): [Vec3, Vec3] {
  const k1x = v
  const k1v = accel(x, h2)
  const k2x = addScaled(v, k1v, 0.5 * dt)
  const k2v = accel(addScaled(x, k1x, 0.5 * dt), h2)
  const k3x = addScaled(v, k2v, 0.5 * dt)
  const k3v = accel(addScaled(x, k2x, 0.5 * dt), h2)
  const k4x = addScaled(v, k3v, dt)
  const k4v = accel(addScaled(x, k3x, dt), h2)
  const dx = add(add(k1x, scale(k2x, 2)), add(scale(k3x, 2), k4x))
  const dv = add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v))
  return [addScaled(x, dx, dt / 6), addScaled(v, dv, dt / 6)]
}

/** Traça o raio que sai de origin na direção n (vista pela câmera parada ali). */
export function traceRay(origin: Vec3, n: Vec3, options: TraceOptions): TraceResult {
  const diskOn = options.disk ?? true
  const diskIn = options.diskIn ?? DISK_IN
  const diskOut = options.diskOut ?? DISK_OUT
  const temp = options.temp ?? DISK_TEMP
  const camDist = length(origin)

  let x = origin
  let v = observerToRay(normalize(n), x)
  const L = cross(x, v)
  const h2 = dot(L, L)

  const crossings: Crossing[] = []
  const path: Vec3[] = [x]
  let opacity = 0
  let minR = camDist
  let captured = false
  let stoppedAtDisk = false
  let stop: { index: number; steps: number; direction: Vec3 } | null = null

  for (let i = 0; i < MAX_LOOP_STEPS; i++) {
    if (i >= options.maxSteps) break // passos acabaram: trata como escapou
    const r = length(x)
    if (r < 1) {
      captured = true
      break
    }
    if (r > ESCAPE_R && dot(x, v) > 0) break
    const prev = x
    const prevV = v
    ;[x, v] = rk4(x, v, h2, Math.min(Math.max(DT_FACTOR * r, MIN_DT), MAX_DT))
    path.push(x)
    if (stop) continue // depois da parada: só segue o caminho
    minR = Math.min(minR, length(x))

    if (diskOn && prev[1] > 0 !== x[1] > 0) {
      const f = prev[1] / (prev[1] - x[1])
      const p = mix(prev, x, f)
      const rp = length(p)
      if (rp > diskIn && rp < diskOut) {
        const direction = normalize(mix(prevV, v, f))
        const alpha = diskAlpha(rp, diskIn, diskOut)
        const gPhysical = frequencyShift(p, rp, direction, camDist)
        const gApplied = 1 + (gPhysical - 1) * options.realism
        const tEmitted = diskTemperature(rp, diskIn, temp)
        crossings.push({ point: p, r: rp, direction, alpha, gPhysical, gApplied, tEmitted, tObserved: gApplied * tEmitted })
        opacity += (1 - opacity) * alpha
        if (opacity > OPACITY_STOP) {
          stoppedAtDisk = true
          stop = { index: path.length - 1, steps: i + 1, direction: normalize(v) }
          if (!options.continueAfterStop) break
        }
      }
    }
  }
  if (length(x) < 1) captured = true

  const endDestination = captured ? 'horizon' : 'sky'
  return {
    destination: stoppedAtDisk ? 'disk' : endDestination,
    crossings,
    opacity,
    minR,
    finalDirection: stop ? stop.direction : normalize(v),
    steps: stop ? stop.steps : path.length - 1,
    path,
    stopIndex: stop ? stop.index : path.length - 1,
    endDestination: options.continueAfterStop || !stop ? endDestination : undefined,
  }
}
