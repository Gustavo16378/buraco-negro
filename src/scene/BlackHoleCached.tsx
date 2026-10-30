import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { HalfFloatType, LinearFilter, Mesh, PerspectiveCamera, PlaneGeometry, Scene, Vector2, WebGLRenderTarget } from 'three'
import { DEBUG } from '../debug.ts'
import { IS_MOBILE, useStore } from '../state/store.ts'
import { bindCache, createBlackHoleUniforms, setPaintTarget, useAnimatedUniforms } from './blackHoleUniforms.ts'
import { MAX_STEPS, createCachedQuality, initialLevels, nextRefineRows, type FrameKind } from './cachedQuality.ts'
import { createGasFields } from './gasFields.ts'
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
// A câmera assentou quando anda menos que isso por quadro: a imagem parada
// começa a ser traçada. O amortecimento do OrbitControls deixa a câmera
// escorregando por vários segundos depois que o dedo solta; a cada quadro
// ela anda 94% do anterior, então daqui em diante escorrega no máximo
// 0,15 · 0,94 / 0,06 ≈ 2,4 pixels, menos que STILL_DRIFT_PX.
const SETTLE_PX = 0.15
// A imagem parada vale até a câmera se afastar isso dela. Enquanto isso ela
// fica congelada e a câmera ainda escorrega por baixo; na troca da imagem em
// movimento (borrada) pela parada, o salto fica em ~2 pixels.
const STILL_DRIFT_PX = 3
// Tempo por quadro desejado enquanto a imagem parada é refinada.
const REFINE_BUDGET = 1 / (IS_MOBILE ? 30 : 50)
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
    /** Linhas da imagem parada traçadas por quadro (ajustado pelo tempo dos quadros). */
    rows: INITIAL_REFINE_ROWS,
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

    return () => {
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
  }, [gl, uniforms, material])

  // Prioridade 0: depois do OrbitControls (-1), que move a câmera, e do
  // avanço do tempo (registrado antes), e antes da sonda (0,5) e do
  // pós-processamento (1), que desenha a tela.
  useFrame(({ camera }, delta) => {
    const s = state.current
    if (!s || !(camera instanceof PerspectiveCamera)) return
    s.gas.update(gl, camera)

    // Qualidade: o tempo deste quadro mede o trabalho do quadro anterior.
    const store = useStore.getState()
    const q = store.quality
    if (s.lastKind === 'refine') s.rows = Math.min(4096, nextRefineRows(s.rows, delta, REFINE_BUDGET))
    const next = s.quality.frame(s.lastKind, delta, q)
    if (next) store.setQuality(next)

    gl.getDrawingBufferSize(size)
    const width = size.x
    const height = size.y
    const moved = s.hasPrevious ? viewShift(s.previous, camera, height) : 0
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
        kind = moved > SETTLE_PX ? 'motion' : 'refine'
      } else if (moved <= SETTLE_PX) {
        if (!still.active) restartCache(still, camera, MAX_STEPS, width, height)
        traceRows(gl, s.tracer, still, uniforms, camera, Math.min(height, still.rows + s.rows))
        if (isComplete(still)) sceneShared.traces++
        kind = 'refine'
      }
    }
    s.lastKind = kind

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
    }

    sceneShared.phase = shown === still ? 'still' : still.active ? 'refining' : 'motion'
    sceneShared.refine = still.active ? Math.min(1, still.rows / still.target.height) : 0
  })

  return (
    <mesh ref={paint} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
