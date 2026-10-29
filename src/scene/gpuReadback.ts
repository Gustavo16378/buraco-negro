import {
  DataUtils,
  FloatType,
  HalfFloatType,
  Mesh,
  PlaneGeometry,
  Scene,
  WebGLRenderTarget,
  type Camera,
  type ShaderMaterial,
  type WebGLRenderer,
} from 'three'

/** Formato em que dá para ler de volta um resultado em ponto flutuante neste aparelho. */
export type ReadbackKind = 'float32' | 'float16'

/**
 * Melhor formato legível: 32 bits se o aparelho deixa desenhar e ler em
 * float32 (EXT_color_buffer_float, comum no desktop); senão 16 bits
 * (EXT_color_buffer_half_float, mais comum no celular); senão nenhum.
 */
export function readbackKind(renderer: WebGLRenderer): ReadbackKind | null {
  if (renderer.extensions.has('EXT_color_buffer_float')) return 'float32'
  if (renderer.extensions.has('EXT_color_buffer_half_float')) return 'float16'
  return null
}

/** Render target 1 x 1 em ponto flutuante que dá para ler de volta, no melhor formato disponível. */
export type PixelReader = {
  kind: ReadbackKind
  target: WebGLRenderTarget
  /** Lê o pixel (rgba) já convertido para float. */
  read: () => Float32Array
  dispose: () => void
}

export function createPixelReader(renderer: WebGLRenderer): PixelReader | null {
  const kind = readbackKind(renderer)
  if (!kind) return null
  const target = new WebGLRenderTarget(1, 1, { type: kind === 'float32' ? FloatType : HalfFloatType })
  const out = new Float32Array(4)
  const half = new Uint16Array(4)
  return {
    kind,
    target,
    read: () => {
      if (kind === 'float32') {
        renderer.readRenderTargetPixels(target, 0, 0, 1, 1, out)
      } else {
        renderer.readRenderTargetPixels(target, 0, 0, 1, 1, half)
        for (let i = 0; i < 4; i++) out[i] = DataUtils.fromHalfFloat(half[i])
      }
      return out
    },
    dispose: () => target.dispose(),
  }
}

/**
 * Passada de um pixel só com o material do buraco negro, num modo de
 * verificação do shader (uProbe: 1 = sonda de raio, 2 = autoteste do céu).
 * Devolve o rgba que o shader escreveu.
 */
export type ShaderPass = {
  kind: ReadbackKind
  run: (material: ShaderMaterial, camera: Camera, mode: 1 | 2) => Float32Array
  dispose: () => void
}

export function createShaderPass(renderer: WebGLRenderer): ShaderPass | null {
  const reader = createPixelReader(renderer)
  if (!reader) return null
  const quad = new Mesh(new PlaneGeometry(2, 2))
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  return {
    kind: reader.kind,
    run: (material, camera, mode) => {
      material.uniforms.uProbe.value = mode
      quad.material = material
      const previous = renderer.getRenderTarget()
      renderer.setRenderTarget(reader.target)
      renderer.render(scene, camera)
      renderer.setRenderTarget(previous)
      material.uniforms.uProbe.value = 0
      return reader.read()
    },
    dispose: () => {
      reader.dispose()
      quad.geometry.dispose()
    },
  }
}
