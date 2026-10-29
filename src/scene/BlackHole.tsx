import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { GLSL3, MathUtils, Matrix4, Mesh, PerspectiveCamera, ShaderMaterial, Vector3 } from 'three'
import { DEBUG } from '../debug.ts'
import fragmentShader from '../shaders/blackhole.frag.glsl?raw'
import vertexShader from '../shaders/fullscreen.vert.glsl?raw'
import { useStore } from '../state/store.ts'
import { measureShadow } from './shadowProbe.ts'

// Passos de integração por raio (SPEC: 300 no desktop).
const MAX_STEPS = 300
// Tempo da simulação, em unidades de r_s / c, por segundo real. Com 4, o gás
// na borda interna (r = 3) dá uma volta em ~12 s e na borda externa em ~90 s.
const TIME_SCALE = 4
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
      uMaxSteps: { value: MAX_STEPS },
      uDebug: { value: DEBUG ? 1 : 0 },
      uDiskIn: { value: 3 },
      uDiskOut: { value: 12 },
      uTemp: { value: 7000 },
      uTime: { value: 0 },
      uRealismo: { value: 0 },
    }),
    [],
  )

  useFrame(({ camera }, delta) => {
    if (!material.current) return
    const u = material.current.uniforms

    // Acumula em vez de usar o relógio absoluto, para a velocidade do tempo
    // poder mudar depois sem o disco dar saltos.
    u.uTime.value += delta * TIME_SCALE

    // Troca de modo animada: o andamento anda em linha reta até o alvo em
    // MODE_TRANSITION segundos, e o uniform recebe uma curva suave dele, para
    // começar e terminar sem tranco.
    const target = useStore.getState().mode === 'real' ? 1 : 0
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

  // A medida precisa ler o framebuffer logo depois do desenho, antes de o
  // navegador apresentar o quadro, por isso fica no onAfterRender do quad.
  useEffect(() => {
    const m = mesh.current
    if (!DEBUG || !m) return
    let frame = 0
    m.onAfterRender = (renderer, _scene, camera) => {
      if (frame++ % MEASURE_EVERY !== 0 || !(camera instanceof PerspectiveCamera)) return
      const result = measureShadow(renderer.getContext() as WebGL2RenderingContext, camera, renderer.domElement.clientHeight)
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
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}
