/** Vetor 3D como tupla: o integrador roda em float64 sem depender do three. */
export type Vec3 = readonly [number, number, number]

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
/** a + b · s */
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const length = (a: Vec3) => Math.sqrt(dot(a, a))
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a))
/** Interpolação linear, como o mix do GLSL. */
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => addScaled(a, sub(b, a), t)
/** Ângulo entre duas direções, em radianos (estável também para ângulos pequenos). */
export const angleBetween = (a: Vec3, b: Vec3) => Math.atan2(length(cross(a, b)), dot(a, b))
