import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { useStore, type PrecisionFormat } from '../state/store.ts'
import { createShaderPass } from './gpuReadback.ts'
import { sceneShared } from './shared.ts'
import { selfTestExpected } from './skySelfTest.ts'

// Diagnóstico do aparelho no ?debug: o que a GPU oferece (precisão, textura,
// leitura em ponto flutuante), um autoteste do céu calculado na GPU e
// comparado com a CPU, e a resolução interna contra a da tela física.

const RENDER_EVERY = 1 // s

function precision(gl: WebGL2RenderingContext, type: number): PrecisionFormat {
  const f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, type)
  return { precision: f?.precision ?? 0, rangeMax: f?.rangeMax ?? 0 }
}

export function DeviceDiagnostics() {
  const renderer = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const done = useRef(false)
  const elapsed = useRef(RENDER_EVERY)

  // Prioridade 0,5: depois do BlackHole, que deixa os uniforms do quadro prontos.
  useFrame((_, delta) => {
    const store = useStore.getState()

    elapsed.current += delta
    if (elapsed.current >= RENDER_EVERY) {
      elapsed.current = 0
      const canvas = renderer.domElement
      const dpr = window.devicePixelRatio || 1
      store.setRender({
        width: canvas.width,
        height: canvas.height,
        physicalWidth: Math.round(canvas.clientWidth * dpr),
        physicalHeight: Math.round(canvas.clientHeight * dpr),
        devicePixelRatio: dpr,
      })
    }

    // Uma vez só, assim que o material existe.
    const material = sceneShared.material
    if (done.current || !material) return
    done.current = true

    const gl = renderer.getContext() as WebGL2RenderingContext
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))

    const pass = createShaderPass(renderer)
    let selfTest = null
    if (pass) {
      const [hash, noise, fbm, milkyWay] = pass.run(material, camera, 2)
      pass.dispose()
      const cpu = selfTestExpected()
      selfTest = {
        hash: [hash, cpu.hash] as [number, number],
        noise: [noise, cpu.noise] as [number, number],
        fbm: [fbm, cpu.fbm] as [number, number],
        milkyWay,
      }
    }

    store.setDevice({
      gpu,
      highFloat: precision(gl, gl.HIGH_FLOAT),
      mediumFloat: precision(gl, gl.MEDIUM_FLOAT),
      highInt: precision(gl, gl.HIGH_INT),
      shaderPrecision: renderer.capabilities.precision,
      maxTextureSize: renderer.capabilities.maxTextureSize,
      readback: pass?.kind ?? null,
      selfTest,
    })
  }, 0.5)

  return null
}
