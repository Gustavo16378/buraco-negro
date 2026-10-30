import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { HalfFloatType, LinearFilter, Mesh, PerspectiveCamera, PlaneGeometry, Scene, Vector2, WebGLRenderTarget } from 'three'
import { DEBUG } from '../debug.ts'
import { IS_MOBILE, useStore } from '../state/store.ts'
import { bindCache, createBlackHoleUniforms, setPaintTarget, useAnimatedUniforms } from './blackHoleUniforms.ts'
import { MAX_STEPS, createCachedQuality, initialLevels, nextRefineRows, type FrameKind } from './cachedQuality.ts'
import { remainingGlide } from './cameraDamping.ts'
import { compileFor } from './compile.ts'
import { createGasFields } from './gasFields.ts'
import { readTexel } from './gpuReadback.ts'
import { createBlackHoleMaterial, paintShader } from './shaderSource.ts'
import { attachShadowMeasure } from './shadowMeasure.ts'
import { sceneShared } from './shared.ts'
import {
  cacheSnapshot,
  captureView,
  createTraceCache,
  createTracer,
  createView,
  isComplete,
  readCacheProbe,
  restartCache,
  traceRows,
  viewShift,
  type TraceCache,
} from './traceCache.ts'

// Limites de movimento da imagem, em pixels do canvas salvo onde dito.
// A cache em movimento é refeita quando a imagem anda mais que isso (em
// pixels da própria cache) desde o traçado dela.
const RETRACE_PX = 0.25
// A câmera assentou quando o que ela ainda vai escorregar fica abaixo disso:
// a imagem parada começa a ser traçada. Depois que o dedo solta, o
// amortecimento deixa a câmera escorregando, cada vez mais devagar
// (cameraDamping.ts); o resto do caminho é a velocidade dividida pelo ritmo
// de queda, o mesmo em qualquer fps.
const SETTLE_PX = 2
// A imagem parada vale até a câmera se afastar isso dela. Enquanto isso ela
// fica congelada e a câmera ainda escorrega por baixo; na troca da imagem em
// movimento (borrada) pela parada, o salto fica em até SETTLE_PX.
const STILL_DRIFT_PX = 3
// Tempo por quadro desejado enquanto a imagem parada é refinada: o maior entre
// este e o tempo normal de um quadro do aparelho mais 30% (num aparelho que já
// leva mais que isso sem refino, a meta fixa faria as faixas encolherem até o
// mínimo e a imagem nítida demoraria muito).
const REFINE_BUDGET = 1 / (IS_MOBILE ? 30 : 50)
const REFINE_OVER_BASE = 1.3
const INITIAL_REFINE_ROWS = 8

function createRenderState(uniforms: ReturnType<typeof createBlackHoleUniforms>, material: ReturnType<typeof createBlackHoleMaterial>) {
  const tracer = createTracer(uniforms)
  const motion = createTraceCache()
  const still = createTraceCache()
  // Pintura em movimento, na resolução da cache pequena, ampliada depois com
  // filtro bilinear (veja paint.frag.glsl).
  const low = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
  })
  const lowQuad = new Mesh(new PlaneGeometry(2, 2), material)
  lowQuad.frustumCulled = false
  lowQuad.onBeforeRender = (renderer) => setPaintTarget(uniforms, renderer)
  const lowScene = new Scene()
  lowScene.add(lowQuad)
  const gas = createGasFields(uniforms)
  return {
    tracer,
    motion,
    still,
    low,
    lowScene,
    gas,
    quality: createCachedQuality(IS_MOBILE),
    /** Câmera do quadro anterior, para medir quanto ela andou. */
    previous: createView(),
    hasPrevious: false,
    /** A cache em exibição. */
    shown: null as TraceCache | null,
    lastKind: 'idle' as FrameKind,
    /** Tempo médio dos quadros sem refino, em segundos. */
    baseFrame: 1 / 60,
    /** Linhas da imagem parada traçadas por quadro (ajustado pelo tempo dos quadros). */
    rows: INITIAL_REFINE_ROWS,
    /** Shaders compilados (sem travar a página) e primeira imagem pronta. */
    compiled: false,
    ready: false,
    dispose: () => {
      tracer.dispose()
      motion.target.dispose()
      still.target.dispose()
      low.dispose()
      lowQuad.geometry.dispose()
      gas.dispose()
    },
  }
}

/**
 * Renderizador com cache (SPEC 6). O espaço-tempo é estático: com a câmera
 * parada, o caminho de cada raio não muda. O traçado, que é a parte cara, vai
 * para caches; a pintura, a cada quadro, só desenha o gás girando e soma o céu.
 *   - Em movimento: uma cache menor que o canvas (dividida por motionDiv) é
 *     refeita quando a imagem anda, pintada na resolução dela e ampliada.
 *   - Parado: a imagem parada, do tamanho do canvas e com MAX_STEPS passos, é
 *     traçada em faixas, algumas linhas por quadro, e entra quando fica pronta.
 */
export function BlackHoleCached() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const paint = useRef<Mesh>(null)
  const state = useRef<ReturnType<typeof createRenderState> | null>(null)
  const size = useMemo(() => new Vector2(), [])
  const uniforms = useMemo(() => createBlackHoleUniforms(), [])
  const material = useMemo(() => createBlackHoleMaterial(paintShader, uniforms), [uniforms])
  useAnimatedUniforms(uniforms)

  useEffect(() => {
    const s = createRenderState(uniforms, material)
    state.current = s
    useStore.getState().setQuality(initialLevels(IS_MOBILE, window.devicePixelRatio || 1))

    // Sonda: o traçado em exibição é o da cache que está na tela, na
    // resolução dela, e a conferência da GPU lê o que ficou gravado nela.
    sceneShared.renderer = 'cached'
    sceneShared.selfTestMaterial = s.tracer.material
    sceneShared.probe = {
      snapshot: () => (s.shown?.active ? cacheSnapshot(s.shown, uniforms) : null),
      readGpu: (px, py) => (s.shown?.active ? readCacheProbe(gl, s.shown, uniforms, px, py) : null),
    }

    const mesh = paint.current
    if (mesh) mesh.onBeforeRender = (renderer) => setPaintTarget(uniforms, renderer)
    const detach = DEBUG && mesh ? attachShadowMeasure(mesh) : null

    // Compila traçado, gás e pintura sem travar a página; até lá a tela de
    // carregamento fica na frente e o quad da tela não é desenhado.
    if (mesh) mesh.visible = false
    let alive = true
    Promise.all([
      compileFor(gl, s.motion.target, s.tracer.scene, camera, s.tracer.scene),
      s.gas.compile(gl, camera),
      compileFor(gl, s.low, s.lowScene, camera, s.lowScene),
    ]).then(() => {
      if (alive) s.compiled = true
    })

    return () => {
      alive = false
      s.dispose()
      material.dispose()
      state.current = null
      bindCache(uniforms, null)
      if (mesh) mesh.onBeforeRender = () => {}
      detach?.()
      sceneShared.renderer = null
      sceneShared.selfTestMaterial = null
      sceneShared.probe = null
      sceneShared.phase = null
    }
  }, [gl, camera, uniforms, material])

  // Prioridade 0: depois do OrbitControls (-1), que move a câmera, e do
  // avanço do tempo (registrado antes), e antes da sonda (0,5) e do
  // pós-processamento (1), que desenha a tela.
  useFrame(({ camera }, delta) => {
    const s = state.current
    if (!s || !s.compiled || !(camera instanceof PerspectiveCamera)) return
    // ?debug: tempo de cada parte do quadro (frameTimer.ts).
    const timer = sceneShared.frameTimer
    timer?.mark('other')
    s.gas.update(gl, camera)
    timer?.mark('gas')

    // Qualidade: o tempo deste quadro mede o trabalho do quadro anterior.
    const store = useStore.getState()
    const q = store.quality
    if (s.lastKind === 'refine') {
      const budget = Math.max(REFINE_BUDGET, s.baseFrame * REFINE_OVER_BASE)
      s.rows = Math.min(4096, nextRefineRows(s.rows, delta, budget))
    } else if (delta < 0.25) {
      s.baseFrame += (delta - s.baseFrame) * 0.1
    }
    const next = s.quality.frame(s.lastKind, delta, q)
    if (next) store.setQuality(next)

    gl.getDrawingBufferSize(size)
    const width = size.x
    const height = size.y
    // Quanto a câmera ainda vai escorregar, pela velocidade deste quadro.
    const glide = s.hasPrevious && delta > 0 ? remainingGlide(viewShift(s.previous, camera, height) / delta) : 0
    const settled = glide <= SETTLE_PX
    captureView(s.previous, camera, q.steps)
    s.hasPrevious = true

    const { motion, still } = s
    let kind: FrameKind = 'idle'

    // A imagem parada vale enquanto tiver o tamanho do canvas e a câmera não
    // se afastar dela.
    if (
      still.active &&
      (still.target.width !== width || still.target.height !== height || viewShift(still.view, camera, height) > STILL_DRIFT_PX)
    ) {
      still.active = false
    }

    if (!isComplete(still)) {
      const mw = Math.max(1, Math.round(width / q.motionDiv))
      const mh = Math.max(1, Math.round(height / q.motionDiv))
      // Enquanto a imagem parada é refinada, a em movimento (borrada) não
      // precisa acompanhar o resto do escorregão da câmera.
      const drift = still.active ? viewShift(motion.view, camera, height) > STILL_DRIFT_PX : viewShift(motion.view, camera, mh) > RETRACE_PX
      const stale = !motion.active || motion.target.width !== mw || motion.target.height !== mh || motion.view.steps !== q.steps || drift
      if (stale) {
        restartCache(motion, camera, q.steps, mw, mh)
        traceRows(gl, s.tracer, motion, uniforms, camera, mh)
        sceneShared.traces++
        // Só conta como movimento se a câmera andou: refazer por troca de
        // qualidade ou de tamanho não mede o custo do movimento.
        kind = settled ? 'refine' : 'motion'
      } else if (settled) {
        if (!still.active) restartCache(still, camera, MAX_STEPS, width, height)
        traceRows(gl, s.tracer, still, uniforms, camera, Math.min(height, still.rows + s.rows))
        if (isComplete(still)) sceneShared.traces++
        kind = 'refine'
      }
    }
    s.lastKind = kind
    timer?.mark('trace')

    // A cache em exibição. Em movimento a pintura roda na resolução dela e o
    // quad da tela só amplia o resultado.
    const shown = isComplete(still) ? still : motion
    s.shown = shown
    bindCache(uniforms, shown.target)
    if (shown === motion) {
      const { low } = s
      if (low.width !== motion.target.width || low.height !== motion.target.height) {
        low.setSize(motion.target.width, motion.target.height)
      }
      const previous = gl.getRenderTarget()
      gl.setRenderTarget(low)
      gl.render(s.lowScene, camera)
      gl.setRenderTarget(previous)
      bindCache(uniforms, shown.target, low.texture)
      timer?.mark('low')
    }

    sceneShared.phase = shown === still ? 'still' : still.active ? 'refining' : 'motion'
    sceneShared.refine = still.active ? Math.min(1, still.rows / still.target.height) : 0

    // Primeiro quadro com tudo compilado. No Windows, o ANGLE (que traduz o
    // WebGL para Direct3D) ainda compila o traçado de novo no primeiro desenho
    // nas 3 texturas da cache: o programa ligado só escreve na primeira saída.
    // Esta leitura espera isso acabar, com a tela de carregamento na frente;
    // depois o quad da tela aparece já com a imagem.
    if (!s.ready) {
      readTexel(gl, motion.target, 0, 0, 0)
      if (paint.current) paint.current.visible = true
      s.ready = true
      store.setReady(true)
    }
  })

  return (
    <mesh ref={paint} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
