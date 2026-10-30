import { WebGLRenderTarget, type WebGLRenderer } from 'three'

/** Partes do quadro medidas no ?debug, na ordem em que acontecem. */
export type FramePart = 'other' | 'gas' | 'trace' | 'low' | 'bloom' | 'post'
export type FrameTimes = Record<FramePart, number> & { total: number }

// Uma amostra por segundo.
const SAMPLE_EVERY = 1

const empty = (): FrameTimes => ({ other: 0, gas: 0, trace: 0, low: 0, bloom: 0, post: 0, total: 0 })

/**
 * ?debug: quanto cada parte do quadro custa, numa amostra por segundo. No
 * quadro de amostra, entre uma parte e a seguinte, a CPU espera a GPU
 * terminar tudo o que foi pedido até ali; o tempo entre duas esperas é o que
 * aquela parte custou (GPU e CPU juntas). Funciona em qualquer aparelho, sem
 * extensão de medida de tempo da GPU. O quadro de amostra sai mais lento
 * (CPU e GPU deixam de trabalhar ao mesmo tempo), por isso só um por segundo.
 */
export function createFrameTimer(renderer: WebGLRenderer) {
  const gl = renderer.getContext()
  // A espera: limpar uma render target de 1 pixel e ler esse pixel. A GPU
  // executa os comandos em ordem, então a leitura só volta quando tudo o que
  // veio antes terminou. (No Chrome, gl.finish() não espera a GPU: com ele as
  // partes saíam com uma fração de milissegundo.)
  const fence = new WebGLRenderTarget(1, 1, { depthBuffer: false })
  const pixel = new Uint8Array(4)
  const wait = () => {
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(fence)
    renderer.clear(true, false, false)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    renderer.setRenderTarget(previous)
    return performance.now()
  }
  let elapsed = SAMPLE_EVERY
  let sampling = false
  let start = 0
  let last = 0
  let current = empty()
  let latest: FrameTimes | null = null

  return {
    /** Começo do quadro: decide se ele é de amostra. */
    begin(delta: number) {
      elapsed += delta
      sampling = elapsed >= SAMPLE_EVERY
      if (!sampling) return
      elapsed = 0
      current = empty()
      start = last = wait()
    },
    /** Fim de uma parte: no quadro de amostra, espera a GPU e soma o tempo à parte. */
    mark(part: FramePart) {
      if (!sampling) return
      const t = wait()
      current[part] += t - last
      last = t
    },
    /** Fim do quadro, depois do pós-processamento. */
    end() {
      if (!sampling) return
      current.total = last - start
      latest = current
      sampling = false
    },
    /** A última amostra completa, em milissegundos. */
    latest: () => latest,
    dispose: () => fence.dispose(),
  }
}

export type FrameTimer = ReturnType<typeof createFrameTimer>
