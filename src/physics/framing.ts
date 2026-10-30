// Enquadramento da câmera conforme a proporção da tela (SPEC 1). Com a tela
// deitada a vista é a de sempre (22 r_s, campo de visão de 45°). Em pé, a
// câmera recua e o campo de visão abre até o disco ocupar 120% da largura da
// tela (pontas levemente cortadas), com a sombra o maior possível dentro disso.

import { traceRay } from './trace.ts'
import { add, cross, normalize, scale, type Vec3 } from './vec3.ts'

/** Inclinação da câmera acima do plano do disco na chegada, em radianos. */
export const CAM_INCL = (8 * Math.PI) / 180
/** Distância com a tela deitada (largura ≥ altura), em r_s. */
export const LANDSCAPE_DIST = 22
/** Distância com a tela em pé (largura / altura ≤ PORTRAIT_ASPECT), em r_s. */
export const PORTRAIT_DIST = 35
const PORTRAIT_ASPECT = 0.6
/** Largura do disco na tela em relação à largura da tela. */
export const DISK_FILL = 1.2
/** Campo de visão vertical mínimo, em graus: o de sempre com a tela deitada. */
export const MIN_FOV = 45
// Passos por raio na busca da borda: o raio só precisa chegar ao plano do disco.
const EDGE_STEPS = 300

/** Distância da câmera para essa proporção da tela (largura / altura), em r_s. */
export function framingDistance(aspect: number) {
  const t = Math.min(1, Math.max(0, (aspect - PORTRAIT_ASPECT) / (1 - PORTRAIT_ASPECT)))
  return PORTRAIT_DIST + (LANDSCAPE_DIST - PORTRAIT_DIST) * t
}

/**
 * Ângulo, visto da câmera, entre o centro da tela e a ponta visível do disco
 * na linha do meio, com a lente gravitacional (radianos). A ponta visível é
 * onde a opacidade do disco cai à metade (r ≈ 11; dali até r = 12 ele some
 * aos poucos). Busca por bissecção o raio mais afastado do centro que ainda
 * cruza o disco nesse trecho, com o integrador da CPU.
 */
export function diskEdgeAngle(distance: number, incl = CAM_INCL) {
  const origin: Vec3 = [0, distance * Math.sin(incl), distance * Math.cos(incl)]
  const forward = normalize(scale(origin, -1))
  const right = normalize(cross(forward, [0, 1, 0]))
  const hits = (angle: number) => {
    const n = add(scale(forward, Math.cos(angle)), scale(right, Math.sin(angle)))
    return traceRay(origin, n, { maxSteps: EDGE_STEPS, realism: 0 }).crossings.some((c) => c.alpha >= 0.5)
  }
  // Na linha do meio, o raio cruza o plano do disco a ~distance · tan(ângulo)
  // do centro: a 8 r_s ele bate no disco e a 20 r_s passa por fora.
  let lo = Math.atan(8 / distance)
  let hi = Math.atan(20 / distance)
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (hits(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** Campo de visão vertical (graus) para essa proporção da tela, com a câmera a `distance`. */
export function framingFov(aspect: number, distance: number) {
  // A ponta do disco fica em DISK_FILL vezes a meia largura da tela.
  const fov = ((2 * Math.atan(Math.tan(diskEdgeAngle(distance)) / (DISK_FILL * aspect))) * 180) / Math.PI
  return Math.max(MIN_FOV, fov)
}
