// Leitura da sonda de raio (SPEC 3.2): tudo o que o painel mostra sobre o raio
// de um pixel, a partir do mesmo traçado que o shader faz.

import { B_C, DISK_IN, DISK_OUT } from './constants.ts'
import { impactParameter, orbitalSpeed, periapsis } from './observables.ts'
import { pixelDirection, traceRay, type CameraState, type Crossing, type Destination, type TraceOptions } from './trace.ts'
import { angleBetween, cross, dot, length, normalize, scale, sub, type Vec3 } from './vec3.ts'

export type Point2 = readonly [number, number]

/** Geometria do diagrama 2D, no plano da órbita do raio (unidades de r_s, centro na origem). */
export type Diagram = {
  /** Caminho até onde o shader para. */
  path: Point2[]
  /** Resto do caminho, depois da parada (desenhado esmaecido). */
  after: Point2[]
  /** Cruzamentos com o disco que contribuem para o pixel. */
  crossings: Point2[]
  camera: Point2
  /** Disco: dois segmentos de r_in a r_out, ou null se o plano da órbita é o próprio plano do disco. */
  disk: [Point2, Point2][] | null
  diskIn: number
  diskOut: number
}

export type ProbeReading = {
  destination: Destination
  /** Opacidade do disco na frente do destino (0 a 1). */
  opacity: number
  /** Parâmetro de impacto, em r_s. */
  b: number
  /** Menor distância ao centro, em r_s; null quando o raio atravessa o horizonte. */
  minDistance: number | null
  /** Desvio total, em graus; null quando o raio cai no horizonte. */
  deflection: number | null
  crossings: Crossing[]
  /** Velocidade do gás no primeiro cruzamento, em fração de c. */
  firstSpeed: number | null
  /** Raio passa tão perto da órbita da luz que a diferença de precisão entre GPU e CPU pode mudar o caminho. */
  sensitive: boolean
  diagram: Diagram
}

/** Coordenadas de tela (-1 a 1) do centro do pixel, como o vUv do shader. */
export function pixelUv(px: number, py: number, width: number, height: number): Point2 {
  return [((px + 0.5) / width) * 2 - 1, ((py + 0.5) / height) * 2 - 1]
}

// Base do plano da órbita: e1 aponta do centro para a câmera, e2 é a parte da
// direção inicial perpendicular a e1. Raio radial (sem parte perpendicular):
// usa o plano que contém também o eixo y, ou o eixo x se a câmera está nele.
function orbitBasis(camPos: Vec3, n: Vec3): [Vec3, Vec3] {
  const e1 = normalize(camPos)
  const perp = (a: Vec3) => sub(a, scale(e1, dot(a, e1)))
  let t = perp(n)
  if (length(t) < 1e-9) t = perp([0, 1, 0])
  if (length(t) < 1e-9) t = perp([1, 0, 0])
  return [e1, normalize(t)]
}

/**
 * Lê o raio do pixel (px, py) do drawing buffer (origem no canto inferior
 * esquerdo), com a câmera e as opções em uso no shader.
 */
export function readProbe(
  camera: CameraState,
  px: number,
  py: number,
  width: number,
  height: number,
  options: TraceOptions,
): ProbeReading {
  const origin = camera.position
  const n = pixelDirection(camera, px, py, width, height)
  const res = traceRay(origin, n, { ...options, continueAfterStop: true })
  const b = impactParameter(origin, n)
  const camDist = length(origin)
  const first = res.crossings[0] ?? null

  // Menor distância (SPEC 2): exata pelo periastro quando o raio passa por
  // ele antes de parar; senão, o menor r do caminho percorrido.
  let minDistance: number | null = null
  if (res.destination !== 'horizon') {
    const radial = dot(n, normalize(origin))
    let passedPeriapsis = false
    for (let i = 1; i <= res.stopIndex && !passedPeriapsis; i++) {
      passedPeriapsis = length(res.path[i]) > length(res.path[i - 1])
    }
    if (radial >= 0) minDistance = camDist
    else if (passedPeriapsis && b > B_C) minDistance = periapsis(b)
    else minDistance = res.minR
  }

  // Desvio total (SPEC 2): no céu, entre a direção do pixel e a direção final;
  // no disco, entre a direção do pixel e a reta da câmera até o ponto do disco.
  let deflection: number | null = null
  if (res.destination === 'sky') deflection = angleBetween(n, res.finalDirection)
  else if (res.destination === 'disk' && first) deflection = angleBetween(n, sub(first.point, origin))

  // Ponto sensível: b a menos de ~2 pixels de b_c e o raio chegando perto da
  // esfera de fótons antes de parar. db/dα ≤ r / sqrt(1 - 1/r).
  const pixelAngle = (2 * Math.tan(camera.fov / 2)) / height
  const sensitive = Math.abs(b - B_C) < (2 * pixelAngle * camDist) / Math.sqrt(1 - 1 / camDist) && res.minR < 2

  // Diagrama no plano da órbita.
  const [e1, e2] = orbitBasis(origin, n)
  const to2 = (p: Vec3): Point2 => [dot(p, e1), dot(p, e2)]
  const normal = cross(e1, e2)
  const diskLine = cross(normal, [0, 1, 0])
  const diskIn = options.diskIn ?? DISK_IN
  const diskOut = options.diskOut ?? DISK_OUT
  let disk: Diagram['disk'] = null
  if (length(diskLine) > 1e-6) {
    const d = normalize(diskLine)
    disk = [
      [to2(scale(d, diskIn)), to2(scale(d, diskOut))],
      [to2(scale(d, -diskIn)), to2(scale(d, -diskOut))],
    ]
  }

  return {
    destination: res.destination,
    opacity: res.opacity,
    b,
    minDistance,
    deflection: deflection === null ? null : (deflection * 180) / Math.PI,
    crossings: res.crossings,
    firstSpeed: first ? orbitalSpeed(first.r) : null,
    sensitive,
    diagram: {
      path: res.path.slice(0, res.stopIndex + 1).map(to2),
      after: res.path.slice(res.stopIndex).map(to2),
      crossings: res.crossings.map((c) => to2(c.point)),
      camera: to2(origin),
      disk,
      diskIn,
      diskOut,
    },
  }
}
