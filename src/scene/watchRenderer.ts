import type { WebGLRenderer } from 'three'
import { useStore } from '../state/store.ts'

/**
 * Leva para a tela de carregamento as falhas que acontecem depois de o WebGL
 * ter sido criado: a GPU parar (contexto perdido) e um shader não compilar
 * neste aparelho. Sem isso, as duas deixam a tela preta sem explicação.
 */
export function watchRenderer(renderer: WebGLRenderer) {
  const fail = useStore.getState().setFailure
  renderer.domElement.addEventListener('webglcontextlost', () => fail('webglcontextlost: a GPU parou de responder'))
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    const log = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)]
      .filter(Boolean)
      .join(' ')
      .trim()
    console.error('THREE.WebGLProgram: shader não compilou', log)
    fail(`shader: ${log.slice(0, 400)}`)
  }
  // Erro de JavaScript antes da primeira imagem (no laço de quadros, por
  // exemplo) também prende a tela de carregamento: mostra o motivo.
  window.addEventListener('error', (e) => {
    if (!useStore.getState().ready) fail(e.message)
  })
}
