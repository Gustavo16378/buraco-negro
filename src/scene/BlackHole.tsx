import { useThree } from '@react-three/fiber'
import { LEGACY } from '../debug.ts'
import { BlackHoleCached } from './BlackHoleCached.tsx'
import { BlackHoleLegacy } from './BlackHoleLegacy.tsx'
import { readbackKind } from './gpuReadback.ts'

/**
 * Escolhe o renderizador. O com cache grava em textura de ponto flutuante,
 * o que exige EXT_color_buffer_float ou EXT_color_buffer_half_float (as
 * mesmas extensões que permitem ler resultados em float); sem elas, ou com
 * ?legacy na URL, fica o direto.
 */
export function BlackHole() {
  const gl = useThree((s) => s.gl)
  const cached = !LEGACY && readbackKind(gl) !== null
  return cached ? <BlackHoleCached /> : <BlackHoleLegacy />
}
