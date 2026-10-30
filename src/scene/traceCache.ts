import {
  AddEquation,
  Color,
  CustomBlending,
  HalfFloatType,
  MathUtils,
  Matrix4,
  Mesh,
  NearestFilter,
  NoBlending,
  OneFactor,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three'
import { OPACITY_STOP } from '../physics/constants.ts'
import type { GpuProbe } from '../state/store.ts'
import { traceOptions, type BlackHoleUniforms } from './blackHoleUniforms.ts'
import { readTexel } from './gpuReadback.ts'
import { createBlackHoleMaterial, traceShader } from './shaderSource.ts'
import type { TraceSnapshot } from './shared.ts'

/** Câmera e passos por raio com que uma cache foi (ou está sendo) traçada. */
export type TraceView = {
  position: Vector3
  quaternion: Quaternion
  matrix: Matrix4
  /** Campo de visão vertical, em graus (como no three). */
  fov: number
  aspect: number
  steps: number
}

export function createView(): TraceView {
  return { position: new Vector3(), quaternion: new Quaternion(), matrix: new Matrix4(), fov: 0, aspect: 0, steps: 0 }
}

/** Copia para `view` a câmera do quadro e o limite de passos. */
export function captureView(view: TraceView, camera: PerspectiveCamera, steps: number) {
  // O OrbitControls move a câmera antes deste ponto, mas a matrixWorld só
  // seria recalculada no render. Atualiza aqui para não usar o frame anterior.
  camera.updateMatrixWorld()
  view.position.copy(camera.position)
  view.quaternion.copy(camera.quaternion)
  view.matrix.copy(camera.matrixWorld)
  view.fov = camera.fov
  view.aspect = camera.aspect
  view.steps = steps
}

/**
 * Quanto a imagem andou entre a vista e a câmera, em pixels de uma tela com
 * `height` linhas: o giro da câmera mais o deslocamento visto do centro (no
 * zoom isso superestima, o que só adianta o traçado). Infinito se o campo de
 * visão ou a proporção da tela mudaram.
 */
export function viewShift(view: TraceView, camera: PerspectiveCamera, height: number) {
  if (view.fov !== camera.fov || view.aspect !== camera.aspect) return Infinity
  const turn = view.quaternion.angleTo(camera.quaternion)
  const shift = view.position.distanceTo(camera.position) / Math.max(camera.position.length(), 1)
  return (turn + shift) / (MathUtils.degToRad(camera.fov) / height)
}

/**
 * Uma cache do traçado: três texturas, uma por saída do trace.frag.glsl (céu,
 * 1º e 2º cruzamento), em float16 e lidas com texelFetch (sem filtro nem
 * mipmap). As linhas são traçadas de baixo para cima, de uma vez ou em faixas.
 */
export type TraceCache = {
  target: WebGLRenderTarget
  view: TraceView
  /** A cache tem uma vista (mesmo que ainda incompleta). */
  active: boolean
  /** Linhas já traçadas. */
  rows: number
}

/**
 * Render target com as 4 saídas do trace.frag.glsl, para a cache (a 4ª fica
 * sem uso) e para a soma da suavização. Sempre 4: no Windows o ANGLE compila
 * o shader de novo para cada formato de saída.
 */
export function createTraceTarget() {
  return new WebGLRenderTarget(1, 1, {
    count: 4,
    type: HalfFloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
  })
}

export function createTraceCache(): TraceCache {
  return { target: createTraceTarget(), view: createView(), active: false, rows: 0 }
}

export const isComplete = (cache: TraceCache) => cache.active && cache.rows >= cache.target.height

/** Começa a cache de novo, com a câmera e os passos deste quadro, em width × height. */
export function restartCache(cache: TraceCache, camera: PerspectiveCamera, steps: number, width: number, height: number) {
  if (cache.target.width !== width || cache.target.height !== height) cache.target.setSize(width, height)
  captureView(cache.view, camera, steps)
  cache.active = true
  cache.rows = 0
}

/** Material e cena de um quad com o shader do traçado, para todas as caches. */
export function createTracer(uniforms: BlackHoleUniforms) {
  const material = createBlackHoleMaterial(traceShader, uniforms)
  // Mistura aditiva (só nas passadas de suavização, veja drawRows).
  material.blendSrc = OneFactor
  material.blendDst = OneFactor
  material.blendEquation = AddEquation
  material.blendSrcAlpha = OneFactor
  material.blendDstAlpha = OneFactor
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  return {
    material,
    scene,
    dispose: () => {
      material.dispose()
      quad.geometry.dispose()
    },
  }
}

export type Tracer = ReturnType<typeof createTracer>

/**
 * Desenha o traçado nas linhas [from, until) de `target`, com a vista dada.
 * As outras linhas ficam como estão (scissor). O quad cobre a tela inteira,
 * então as derivadas de tela do céu saem iguais às de um traçado de uma vez.
 * Com `jitter` (em pixels), é uma passada de suavização: o raio sai deslocado
 * dentro do pixel e o resultado é somado ao que já está em `target`.
 */
function drawRows(
  renderer: WebGLRenderer,
  tracer: Tracer,
  target: WebGLRenderTarget,
  view: TraceView,
  uniforms: BlackHoleUniforms,
  camera: Camera,
  from: number,
  until: number,
  jitter: readonly [number, number] | null,
) {
  uniforms.uCamPos.value.copy(view.position)
  uniforms.uCamMatrix.value.copy(view.matrix)
  uniforms.uFov.value = MathUtils.degToRad(view.fov)
  uniforms.uAspect.value = view.aspect
  uniforms.uMaxSteps.value = view.steps
  uniforms.uPixelScale.value = target.height / Math.max(1, renderer.domElement.clientHeight)
  uniforms.uAccumulate.value = jitter ? 1 : 0
  // Pixel em coordenadas de tela (-1 a 1): 2 / largura e 2 / altura.
  uniforms.uJitter.value.set(jitter ? (2 * jitter[0]) / target.width : 0, jitter ? (2 * jitter[1]) / target.height : 0)
  tracer.material.blending = jitter ? CustomBlending : NoBlending
  target.scissor.set(0, from, target.width, until - from)
  target.scissorTest = true
  const previous = renderer.getRenderTarget()
  renderer.setRenderTarget(target)
  renderer.render(tracer.scene, camera)
  renderer.setRenderTarget(previous)
  target.scissorTest = false
  tracer.material.blending = NoBlending
  uniforms.uAccumulate.value = 0
  uniforms.uJitter.value.set(0, 0)
}

/** Traça as linhas da cache de `cache.rows` até `until`, com a vista dela. */
export function traceRows(
  renderer: WebGLRenderer,
  tracer: Tracer,
  cache: TraceCache,
  uniforms: BlackHoleUniforms,
  camera: Camera,
  until: number,
) {
  drawRows(renderer, tracer, cache.target, cache.view, uniforms, camera, cache.rows, until, null)
  cache.rows = until
}

/**
 * Suavização da imagem parada: a soma das amostras extras de cada pixel, com
 * o raio deslocado dentro do pixel (trace.frag.glsl). Amostras inteiras, uma
 * depois da outra, cada uma traçada em faixas como a imagem parada.
 */
export type Accumulation = {
  target: WebGLRenderTarget
  /** Amostras completas. */
  samples: number
  /** Linhas já traçadas da amostra em andamento. */
  rows: number
  active: boolean
}

export function createAccumulation(): Accumulation {
  return { target: createTraceTarget(), samples: 0, rows: 0, active: false }
}

/** Zera a soma para a imagem parada `still` (do mesmo tamanho dela). */
export function restartAccumulation(renderer: WebGLRenderer, acc: Accumulation, still: TraceCache) {
  const { width, height } = still.target
  if (acc.target.width !== width || acc.target.height !== height) acc.target.setSize(width, height)
  const previous = renderer.getRenderTarget()
  const clearColor = renderer.getClearColor(new Color())
  const clearAlpha = renderer.getClearAlpha()
  renderer.setRenderTarget(acc.target)
  renderer.setClearColor(0x000000, 0)
  renderer.clear(true, false, false)
  renderer.setClearColor(clearColor, clearAlpha)
  renderer.setRenderTarget(previous)
  acc.samples = 0
  acc.rows = 0
  acc.active = true
}

/** Soma as linhas da amostra em andamento até `until`, com o deslocamento `jitter` (pixels). */
export function accumulateRows(
  renderer: WebGLRenderer,
  tracer: Tracer,
  acc: Accumulation,
  still: TraceCache,
  uniforms: BlackHoleUniforms,
  camera: Camera,
  until: number,
  jitter: readonly [number, number],
) {
  drawRows(renderer, tracer, acc.target, still.view, uniforms, camera, acc.rows, until, jitter)
  acc.rows = until
  if (acc.rows >= acc.target.height) {
    acc.samples++
    acc.rows = 0
  }
}

/** O traçado guardado na cache, para a sonda refazer o raio na CPU. */
export function cacheSnapshot(cache: TraceCache, uniforms: BlackHoleUniforms): TraceSnapshot {
  const { view, target } = cache
  return {
    camera: {
      position: [view.position.x, view.position.y, view.position.z],
      matrix: view.matrix.elements,
      fov: MathUtils.degToRad(view.fov),
      aspect: view.aspect,
    },
    width: target.width,
    height: target.height,
    options: traceOptions(uniforms, view.steps),
  }
}

/** ?debug: o que o traçado gravou na cache para o pixel (px, py), no formato da sonda. */
export function readCacheProbe(
  renderer: WebGLRenderer,
  cache: TraceCache,
  uniforms: BlackHoleUniforms,
  px: number,
  py: number,
): GpuProbe | null {
  const hit = readTexel(renderer, cache.target, 1, px, py)
  const rest = readTexel(renderer, cache.target, 2, px, py)
  if (!hit || !rest) return null
  const [r, , shift, captured] = hit
  const opacity = rest[3]
  return {
    destination: opacity > OPACITY_STOP ? 'disk' : captured > 0.5 ? 'horizon' : 'sky',
    r,
    g: r > 0 ? MathUtils.lerp(1, shift, uniforms.uRealismo.value) : 0,
    opacity,
  }
}
