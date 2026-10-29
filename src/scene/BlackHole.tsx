import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { GLSL3, MathUtils, Matrix4, PerspectiveCamera, ShaderMaterial, Vector3 } from 'three'
import fragmentShader from '../shaders/blackhole.frag.glsl?raw'
import vertexShader from '../shaders/fullscreen.vert.glsl?raw'

export function BlackHole() {
  const material = useRef<ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uCamPos: { value: new Vector3() },
      uCamMatrix: { value: new Matrix4() },
      uFov: { value: 1 },
      uAspect: { value: 1 },
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

  return (
    <mesh frustumCulled={false}>
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
