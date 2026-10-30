import type { Camera, Object3D, Scene, WebGLRenderer, WebGLRenderTarget } from 'three'

/**
 * Compila os materiais de `object` sem travar a página: o compileAsync do
 * three usa KHR_parallel_shader_compile e só avisa quando os programas estão
 * prontos. A compilação acontece com `target` ligado, porque o espaço de cor
 * da saída entra na chave do programa: compilando com a render target do
 * desenho de verdade (ponto flutuante, linear), o primeiro desenho reaproveita
 * o programa em vez de compilar outro.
 */
export function compileFor(
  renderer: WebGLRenderer,
  target: WebGLRenderTarget,
  object: Object3D,
  camera: Camera,
  scene: Scene | null = null,
) {
  const previous = renderer.getRenderTarget()
  renderer.setRenderTarget(target)
  const done = renderer.compileAsync(object, camera, scene)
  renderer.setRenderTarget(previous)
  return done
}
