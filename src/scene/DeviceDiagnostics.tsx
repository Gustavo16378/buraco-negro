import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useStore, type PrecisionFormat } from '../state/store.ts'
import { createFrameTimer } from './frameTimer.ts'
import { createShaderPass } from './gpuReadback.ts'
import { sceneShared } from './shared.ts'
import { selfTestExpected } from './skySelfTest.ts'

// Diagnóstico do aparelho no ?debug: o que a GPU oferece (precisão, textura,
// leitura em ponto flutuante), um autoteste do céu calculado na GPU e
// comparado com a CPU, e a resolução interna contra a da tela física.

const RENDER_EVERY = 1 // s
const FPS_EVERY = 0.5 // s

function precision(gl: WebGL2RenderingContext, type: number): PrecisionFormat {
  const f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, type)
  return { precision: f?.precision ?? 0, rangeMax: f?.rangeMax ?? 0 }
}

export function DeviceDiagnostics() {
  const renderer = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const done = useRef(false)
  const elapsed = useRef(RENDER_EVERY)
  const traces = useRef(sceneShared.traces)
  const frames = useRef({ count: 0, elapsed: 0 })

  // Tempo de cada parte do quadro (frameTimer.ts). O começo vem antes de
  // tudo (-3); o renderizador marca gás, traçado e pintura reduzida; antes do
  // pós-processamento (0,95) fecha o que sobrou (controles, sonda, este
  // diagnóstico) e depois dele (2) fecha o pós-processamento e o quadro.
  useEffect(() => {
    const timer = createFrameTimer(renderer)
    sceneShared.frameTimer = timer
    return () => {
      timer.dispose()
      sceneShared.frameTimer = null
    }
  }, [renderer])
  useFrame((_, delta) => sceneShared.frameTimer?.begin(delta), -3)
  useFrame(() => sceneShared.frameTimer?.mark('other'), 0.95)
  useFrame(() => {
    sceneShared.frameTimer?.mark('post')
    sceneShared.frameTimer?.end()
  }, 2)

  // Prioridade 0,5: depois do BlackHole, que deixa os uniforms do quadro prontos.
  useFrame((_, delta) => {
    const store = useStore.getState()

    // fps, medido a cada meio segundo.
    const f = frames.current
    f.count++
    f.elapsed += delta
    if (f.elapsed >= FPS_EVERY) {
      store.setFps(f.count / f.elapsed)
      f.count = 0
      f.elapsed = 0
    }

    elapsed.current += delta
    if (elapsed.current >= RENDER_EVERY) {
      const canvas = renderer.domElement
      const dpr = window.devicePixelRatio || 1
      const snapshot = sceneShared.probe?.snapshot()
      store.setRender({
        width: canvas.width,
        height: canvas.height,
        physicalWidth: Math.round(canvas.clientWidth * dpr),
        physicalHeight: Math.round(canvas.clientHeight * dpr),
        devicePixelRatio: dpr,
        renderer: sceneShared.renderer,
        traceWidth: snapshot?.width ?? 0,
        traceHeight: snapshot?.height ?? 0,
        tracesPerSecond: (sceneShared.traces - traces.current) / elapsed.current,
        phase: sceneShared.phase,
        refine: sceneShared.refine,
        times: sceneShared.frameTimer?.latest() ?? null,
      })
      traces.current = sceneShared.traces
      elapsed.current = 0
    }

    // Uma vez só, depois que os shaders compilaram (antes disso, desenhar com o
    // material travaria a página esperando a compilação).
    const material = sceneShared.selfTestMaterial
    if (done.current || !material || !store.ready) return
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
