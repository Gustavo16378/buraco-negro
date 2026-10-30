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
import { useStore } from '../state/store.ts'
import type { TraceSnapshot } from './shared.ts'
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

/** Liga (ou desliga, com null) as texturas da cache do traçado à pintura. */
export function bindCache(u: BlackHoleUniforms, cache: WebGLRenderTarget | null) {
  u.uCacheSky.value = cache?.textures[0] ?? null
  u.uCacheFirst.value = cache?.textures[1] ?? null
  u.uCacheSecond.value = cache?.textures[2] ?? null
}

/**
 * Proporção entre a cache e o destino em que a pintura está desenhando
 * agora (a render target do pós-processamento ou a tela), para cada pixel
 * pegar o texel da cache que o cobre.
 */
export function setCacheScale(u: BlackHoleUniforms, cache: WebGLRenderTarget, renderer: WebGLRenderer) {
  const out = renderer.getRenderTarget()
  const gl = renderer.getContext()
  const width = out ? out.width : gl.drawingBufferWidth
  const height = out ? out.height : gl.drawingBufferHeight
  u.uCacheScale.value.set(cache.width / width, cache.height / height)
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
    options: {
      maxSteps: u.uMaxSteps.value,
      realism: u.uRealismo.value,
      diskIn: u.uDiskIn.value,
      diskOut: u.uDiskOut.value,
      temp: u.uTemp.value,
    },
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
