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
// No modo de depuração, mede a sombra a cada tantos quadros (readPixels trava a GPU).
const MEASURE_EVERY = 20

export function BlackHole() {
  const mesh = useRef<Mesh>(null)
  const material = useRef<ShaderMaterial>(null)
  const setShadow = useStore((s) => s.setShadow)

  const uniforms = useMemo(
    () => ({
      uCamPos: { value: new Vector3() },
      uCamMatrix: { value: new Matrix4() },
      uFov: { value: 1 },
      uAspect: { value: 1 },
      uMaxSteps: { value: MAX_STEPS },
      uDebug: { value: DEBUG ? 1 : 0 },
    }),
    [],
  )

  useFrame(({ camera }) => {
    if (!material.current) return
    const u = material.current.uniforms

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
