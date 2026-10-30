import { FloatType, HalfFloatType, PerspectiveCamera, type Mesh } from 'three'
import { useStore } from '../state/store.ts'
import { measureShadow, type PixelSource } from './shadowProbe.ts'

// No modo de depuração, mede a sombra a cada tantos quadros (readPixels trava a GPU).
const MEASURE_EVERY = 20

/**
 * ?debug: mede o raio da sombra logo depois de o quad do buraco negro ser
 * desenhado. Com o pós-processamento, esse desenho vai para a render target
 * de entrada do compositor (ponto flutuante, antes do bloom e do tone
 * mapping), que é o que fica ligado no onAfterRender. Devolve a função que
 * desliga a medição.
 */
export function attachShadowMeasure(mesh: Mesh) {
  let frame = 0
  mesh.onAfterRender = (renderer, _scene, camera) => {
    if (frame++ % MEASURE_EVERY !== 0 || !(camera instanceof PerspectiveCamera)) return
    const gl = renderer.getContext() as WebGL2RenderingContext
    const target = renderer.getRenderTarget()
    // A render target do compositor é float16. Dá para lê-la como float32 se
    // o aparelho tem EXT_color_buffer_float (desktop); senão, em 16 bits.
    const isFloat = target && (target.texture.type === HalfFloatType || target.texture.type === FloatType)
    const type: PixelSource['type'] = !isFloat
      ? 'byte'
      : target.texture.type === FloatType || renderer.extensions.has('EXT_color_buffer_float')
        ? 'float'
        : 'half'
    const source: PixelSource = target
      ? { width: target.width, height: target.height, type }
      : { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, type: 'byte' }
    const result = measureShadow(gl, source, camera, renderer.domElement.clientHeight)
    if (result) useStore.getState().setShadow(result)
  }
  return () => {
    mesh.onAfterRender = () => {}
  }
}
