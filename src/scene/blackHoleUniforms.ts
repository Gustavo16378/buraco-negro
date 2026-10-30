import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import {
  MathUtils,
  Matrix4,
  PerspectiveCamera,
  Vector2,
  Vector3,
  type Camera,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import { DEBUG } from '../debug.ts'
import { DISK_IN, DISK_OUT, DISK_TEMP, TIME_SCALE } from '../physics/constants.ts'
import type { TraceOptions } from '../physics/trace.ts'
import { useStore } from '../state/store.ts'
import type { TraceSnapshot } from './shared.ts'
import { BLOOM } from './bloomSettings.ts'
import { SELF_TEST_HASH_INPUT, SELF_TEST_POINT } from './skySelfTest.ts'

// Maior intervalo entre quadros que a animação aceita, em segundos. Depois de
// a aba ficar oculta, o primeiro quadro traz um intervalo enorme; sem esse
// limite o disco e a troca de modo dariam um salto.
const MAX_DELTA = 0.1
// Duração da troca entre os modos Interstellar e Física real, em segundos.
const MODE_TRANSITION = 0.8

/**
 * Uniforms do buraco negro. Um objeto só, compartilhado por todos os
 * materiais de um renderizador (traçado, pintura, autoteste), para nenhum
 * ficar com valor velho.
 */
export function createBlackHoleUniforms() {
  return {
    uCamPos: { value: new Vector3() },
    uCamMatrix: { value: new Matrix4() },
    uFov: { value: 1 },
    uAspect: { value: 1 },
    uMaxSteps: { value: useStore.getState().quality.steps },
    uDebug: { value: DEBUG ? 1 : 0 },
    uDiskIn: { value: DISK_IN },
    uDiskOut: { value: DISK_OUT },
    uTemp: { value: DISK_TEMP },
    uTime: { value: 0 },
    uRealismo: { value: 0 },
    uProbe: { value: 0 },
    uProbeUv: { value: new Vector2() },
    uSelfTestHash: { value: new Vector3(...SELF_TEST_HASH_INPUT) },
    uSelfTestPoint: { value: new Vector3(...SELF_TEST_POINT) },
    uCacheSky: { value: null as Texture | null },
    uCacheFirst: { value: null as Texture | null },
    uCacheSecond: { value: null as Texture | null },
    uCacheScale: { value: new Vector2(1, 1) },
    uGas0: { value: null as Texture | null },
    uGas1: { value: null as Texture | null },
    uGasSeed: { value: 0 },
    uNoUnroll: { value: 0 }, // sempre 0: veja common.glsl
    uPixelScale: { value: 1 },
    uUpsample: { value: 0 },
    uLowColor: { value: null as Texture | null },
    uPaintSize: { value: new Vector2(1, 1) },
    uFinal: { value: 0 },
    uAccumulate: { value: 0 },
    uJitter: { value: new Vector2() },
    uAcc0: { value: null as Texture | null },
    uAcc1: { value: null as Texture | null },
    uAcc2: { value: null as Texture | null },
    uAcc3: { value: null as Texture | null },
    uAccOn: { value: 0 },
    uBloom: { value: null as Texture | null },
    uBloomIntensity: { value: BLOOM.intensity },
    uBloomThreshold: { value: BLOOM.threshold },
    uBloomSmoothing: { value: BLOOM.smoothing },
  }
}

export type BlackHoleUniforms = ReturnType<typeof createBlackHoleUniforms>

/**
 * Copia para os uniforms o que define o traçado: a câmera do quadro
 * (posição, orientação, campo de visão) e o limite de passos por raio.
 */
export function copyTraceInputs(u: BlackHoleUniforms, camera: Camera, steps: number) {
  // O OrbitControls move a câmera antes deste ponto, mas a matrixWorld só
  // seria recalculada no render. Atualiza aqui para não usar o frame anterior.
  camera.updateMatrixWorld()
  u.uCamPos.value.copy(camera.position)
  u.uCamMatrix.value.copy(camera.matrixWorld)
  if (camera instanceof PerspectiveCamera) {
    u.uFov.value = MathUtils.degToRad(camera.fov)
    u.uAspect.value = camera.aspect
  }
  u.uMaxSteps.value = steps
}

/**
 * Liga (ou desliga, com null) as texturas da cache do traçado à pintura. Com
 * lowColor, o quad da tela só amplia essa pintura já feita na resolução da
 * cache (em movimento); sem ele, pinta direto da cache.
 */
export function bindCache(u: BlackHoleUniforms, cache: WebGLRenderTarget | null, lowColor: Texture | null = null) {
  u.uCacheSky.value = cache?.textures[0] ?? null
  u.uCacheFirst.value = cache?.textures[1] ?? null
  u.uCacheSecond.value = cache?.textures[2] ?? null
  u.uLowColor.value = lowColor
  u.uUpsample.value = lowColor ? 1 : 0
}

/** Liga (ou desliga, com null) a soma da suavização da imagem parada à pintura. */
export function bindAccumulation(u: BlackHoleUniforms, acc: WebGLRenderTarget | null) {
  u.uAcc0.value = acc?.textures[0] ?? null
  u.uAcc1.value = acc?.textures[1] ?? null
  u.uAcc2.value = acc?.textures[2] ?? null
  u.uAcc3.value = acc?.textures[3] ?? null
  u.uAccOn.value = acc ? 1 : 0
}

/**
 * Passada final da pintura (na tela: soma o bloom e aplica o tone mapping) ou
 * intermediária (a pintura reduzida em movimento, em HDR).
 */
export function setFinalPass(u: BlackHoleUniforms, final: boolean, bloom: Texture | null = null) {
  u.uFinal.value = final ? 1 : 0
  if (bloom) u.uBloom.value = bloom
}

/**
 * Tamanho do destino em que a pintura está desenhando agora (a render target
 * do pós-processamento, a da pintura reduzida ou a tela) e a proporção entre
 * a cache ligada e ele, para cada pixel pegar o texel da cache que o cobre.
 */
export function setPaintTarget(u: BlackHoleUniforms, renderer: WebGLRenderer) {
  const out = renderer.getRenderTarget()
  const gl = renderer.getContext()
  const width = out ? out.width : gl.drawingBufferWidth
  const height = out ? out.height : gl.drawingBufferHeight
  u.uPaintSize.value.set(width, height)
  const cache = u.uCacheSky.value?.image as { width: number; height: number } | undefined
  if (cache) u.uCacheScale.value.set(cache.width / width, cache.height / height)
}

/** Opções do traçado para a sonda refazer o raio na CPU, com o modo em uso agora. */
export function traceOptions(u: BlackHoleUniforms, steps: number): TraceOptions {
  return {
    maxSteps: steps,
    realism: u.uRealismo.value,
    diskIn: u.uDiskIn.value,
    diskOut: u.uDiskOut.value,
    temp: u.uTemp.value,
  }
}

/**
 * O traçado descrito pelos uniforms (câmera e opções com que os raios foram
 * integrados), numa resolução de width × height, com o modo em uso agora.
 */
export function traceSnapshot(u: BlackHoleUniforms, width: number, height: number): TraceSnapshot {
  const p = u.uCamPos.value
  return {
    camera: { position: [p.x, p.y, p.z], matrix: u.uCamMatrix.value.elements, fov: u.uFov.value, aspect: u.uAspect.value },
    width,
    height,
    options: traceOptions(u, u.uMaxSteps.value),
  }
}

/**
 * Avança o tempo da simulação e a troca de modo em um quadro. progress é o
 * andamento linear da troca, de 0 (Interstellar) a 1 (Física real).
 */
function animate(u: BlackHoleUniforms, rawDelta: number, progress: { current: number }) {
  const delta = Math.min(rawDelta, MAX_DELTA)

  // Acumula em vez de usar o relógio absoluto, para a velocidade do tempo
  // poder mudar depois sem o disco dar saltos.
  u.uTime.value += delta * TIME_SCALE

  // Troca de modo animada: o andamento anda em linha reta até o alvo em
  // MODE_TRANSITION segundos, e o uniform recebe uma curva suave dele, para
  // começar e terminar sem tranco.
  const target = useStore.getState().mode === 'real' ? 1 : 0
  const step = delta / MODE_TRANSITION
  progress.current += MathUtils.clamp(target - progress.current, -step, step)
  u.uRealismo.value = MathUtils.smoothstep(progress.current, 0, 1)
}

/** A cada quadro: avança o tempo da simulação e anima a troca de modo. */
export function useAnimatedUniforms(u: BlackHoleUniforms) {
  const progress = useRef(useStore.getState().mode === 'real' ? 1 : 0)
  useFrame((_, rawDelta) => animate(u, rawDelta, progress))
}
