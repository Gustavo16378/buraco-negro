import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  FloatType,
  GLSL3,
  HalfFloatType,
  MathUtils,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'
import { DEBUG } from '../debug.ts'
import { DISK_IN, DISK_OUT, DISK_TEMP, shaderDefines, TIME_SCALE } from '../physics/constants.ts'
import fragmentShader from '../shaders/blackhole.frag.glsl?raw'
import vertexShader from '../shaders/fullscreen.vert.glsl?raw'
import { useStore } from '../state/store.ts'
import { sceneShared } from './shared.ts'
import { measureShadow, type PixelSource } from './shadowProbe.ts'
import { SELF_TEST_HASH_INPUT, SELF_TEST_POINT } from './skySelfTest.ts'

// Maior intervalo entre quadros que a animação aceita, em segundos. Depois de
// a aba ficar oculta, o primeiro quadro traz um intervalo enorme; sem esse
// limite o disco e a troca de modo dariam um salto.
const MAX_DELTA = 0.1
// No modo de depuração, mede a sombra a cada tantos quadros (readPixels trava a GPU).
const MEASURE_EVERY = 20
// Duração da troca entre os modos Interstellar e Física real, em segundos.
const MODE_TRANSITION = 0.8

export function BlackHole() {
  const mesh = useRef<Mesh>(null)
  const material = useRef<ShaderMaterial>(null)
  // Andamento linear da troca de modo, de 0 (Interstellar) a 1 (Física real).
  const realism = useRef(useStore.getState().mode === 'real' ? 1 : 0)
  const setShadow = useStore((s) => s.setShadow)

  const uniforms = useMemo(
    () => ({
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
    }),
    [],
  )

  useFrame(({ camera }, rawDelta) => {
    if (!material.current) return
    const u = material.current.uniforms
    const delta = Math.min(rawDelta, MAX_DELTA)
    const { mode, quality } = useStore.getState()

    // Passos por raio: o PerformanceMonitor (Quality.tsx) ajusta.
    u.uMaxSteps.value = quality.steps

    // Acumula em vez de usar o relógio absoluto, para a velocidade do tempo
    // poder mudar depois sem o disco dar saltos.
    u.uTime.value += delta * TIME_SCALE

    // Troca de modo animada: o andamento anda em linha reta até o alvo em
    // MODE_TRANSITION segundos, e o uniform recebe uma curva suave dele, para
    // começar e terminar sem tranco.
    const target = mode === 'real' ? 1 : 0
    const step = delta / MODE_TRANSITION
    realism.current += MathUtils.clamp(target - realism.current, -step, step)
    u.uRealismo.value = MathUtils.smoothstep(realism.current, 0, 1)

    // O OrbitControls move a câmera antes deste callback, mas a matrixWorld
    // só seria recalculada no render. Atualiza aqui para não usar o frame anterior.
    camera.updateMatrixWorld()
    u.uCamPos.value.copy(camera.position)
    u.uCamMatrix.value.copy(camera.matrixWorld)
    if (camera instanceof PerspectiveCamera) {
      u.uFov.value = MathUtils.degToRad(camera.fov)
      u.uAspect.value = camera.aspect
    }
  })

  // A medida precisa ler o resultado do shader logo depois do desenho do quad.
  // Com o pós-processamento, esse desenho vai para a render target de entrada
  // do compositor (ponto flutuante, antes do bloom e do tone mapping), que é
  // o que fica ligado no onAfterRender.
  useEffect(() => {
    sceneShared.material = material.current
    return () => {
      sceneShared.material = null
    }
  }, [])

  useEffect(() => {
    const m = mesh.current
    if (!DEBUG || !m) return
    let frame = 0
    m.onAfterRender = (renderer, _scene, camera) => {
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
      if (result) setShadow(result)
    }
    return () => {
      m.onAfterRender = () => {}
    }
  }, [setShadow])

  return (
    <mesh ref={mesh} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        glslVersion={GLSL3}
        defines={shaderDefines}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}
