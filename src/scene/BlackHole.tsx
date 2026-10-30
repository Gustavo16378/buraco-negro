import { useThree } from '@react-three/fiber'
import { LEGACY } from '../debug.ts'
import { BlackHoleCached } from './BlackHoleCached.tsx'
import { BlackHoleLegacy } from './BlackHoleLegacy.tsx'
import { Effects } from './Effects.tsx'
import { readbackKind } from './gpuReadback.ts'
import { Quality } from './Quality.tsx'

/**
 * Escolhe o renderizador. O com cache grava em textura de ponto flutuante,
 * o que exige EXT_color_buffer_float ou EXT_color_buffer_half_float (as
 * mesmas extensões que permitem ler resultados em float); sem elas, ou com
 * ?legacy na URL, fica o direto, com o ajuste de qualidade dele.
 */
export function BlackHole() {
  const gl = useThree((s) => s.gl)
  const cached = !LEGACY && readbackKind(gl) !== null
  // O com cache faz o próprio bloom e tone mapping e desenha na tela; o
  // direto usa o pós-processamento do postprocessing.
  if (cached) return <BlackHoleCached />
  return (
    <>
      <BlackHoleLegacy />
      <Effects />
      <Quality />
    </>
  )
}
