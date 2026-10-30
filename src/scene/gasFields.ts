import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  Scene,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from 'three'
import type { BlackHoleUniforms } from './blackHoleUniforms.ts'
import { compileFor } from './compile.ts'
import { gasSeeds } from './gasSeeds.ts'
import { createBlackHoleMaterial, gasShader } from './shaderSource.ts'

// Grade polar de cada campo de ruído: GAS_R amostras em r e GAS_PHI no ângulo.
const GAS_R = 1024
const GAS_PHI = 512
// Um campo novo é calculado em tantas faixas, uma por quadro. Entre dois
// reinícios há pelo menos 50 quadros (o tempo anda no máximo 0,4 r_s / c por
// quadro e os reinícios vêm a cada 20), então ele fica pronto bem antes.
const STRIPS = 16
const STRIP_ROWS = GAS_PHI / STRIPS

type Field = { target: WebGLRenderTarget; seed: number | null; rows: number }

/**
 * Campos de ruído do gás do renderizador com cache. São três: os das duas
 * cópias em uso e o da próxima a reiniciar, calculado aos poucos antes de
 * ser preciso. Quando uma cópia reinicia, o campo pronto entra no lugar e o
 * velho passa a receber o seguinte.
 */
export function createGasFields(uniforms: BlackHoleUniforms, anisotropy: number) {
  const material = createBlackHoleMaterial(gasShader, uniforms)
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  // float16 de um canal; o ângulo dá a volta (RepeatWrapping) e o raio para
  // nas bordas do disco. Com mipmaps e filtro anisotrópico: a pintura lê o
  // gás com a área que o pixel cobre no disco (cacheDisk.glsl). O three refaz
  // os mipmaps depois de cada faixa desenhada no campo.
  const fields: Field[] = Array.from({ length: 3 }, () => ({
    target: new WebGLRenderTarget(GAS_R, GAS_PHI, {
      type: HalfFloatType,
      format: RedFormat,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: RepeatWrapping,
      generateMipmaps: true,
      anisotropy,
      depthBuffer: false,
    }),
    seed: null,
    rows: 0,
  }))

  // O campo com essa semente; se nenhum tem, o primeiro que não guarda uma
  // das sementes em `keep` é zerado para recebê-la.
  const acquire = (seed: number, keep: number[]) => {
    const found = fields.find((f) => f.seed === seed)
    if (found) return found
    const free = fields.find((f) => f.seed === null || !keep.includes(f.seed))!
    free.seed = seed
    free.rows = 0
    return free
  }

  // Calcula as linhas do campo até `until` (GAS_PHI = completo).
  const fill = (renderer: WebGLRenderer, camera: Camera, field: Field, until: number) => {
    const { target } = field
    uniforms.uGasSeed.value = field.seed ?? 0
    target.scissor.set(0, field.rows, GAS_R, until - field.rows)
    target.scissorTest = true
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    renderer.setRenderTarget(previous)
    target.scissorTest = false
    field.rows = until
  }

  return {
    /** Compila o shader do gás sem travar a página (veja compile.ts). */
    compile: (renderer: WebGLRenderer, camera: Camera) => compileFor(renderer, fields[0].target, scene, camera, scene),
    /** A cada quadro, depois de avançar o tempo e antes da pintura. */
    update(renderer: WebGLRenderer, camera: Camera) {
      const { seed0, seed1, next } = gasSeeds(uniforms.uTime.value)
      const live0 = acquire(seed0, [seed1])
      const live1 = acquire(seed1, [seed0])
      const coming = acquire(next, [seed0, seed1])
      // Os campos em uso só ficam incompletos no início ou se o tempo pular.
      if (live0.rows < GAS_PHI) fill(renderer, camera, live0, GAS_PHI)
      if (live1.rows < GAS_PHI) fill(renderer, camera, live1, GAS_PHI)
      if (coming.rows < GAS_PHI) fill(renderer, camera, coming, Math.min(GAS_PHI, coming.rows + STRIP_ROWS))
      uniforms.uGas0.value = live0.target.texture
      uniforms.uGas1.value = live1.target.texture
    },
    dispose() {
      for (const f of fields) f.target.dispose()
      material.dispose()
      quad.geometry.dispose()
      uniforms.uGas0.value = null
      uniforms.uGas1.value = null
    },
  }
}

export type GasFields = ReturnType<typeof createGasFields>
