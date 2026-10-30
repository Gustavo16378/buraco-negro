import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { MathUtils, PerspectiveCamera, type Camera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { framingDistance, framingFov } from '../physics/framing.ts'
import { DAMPING_AT_60, dampingFactor } from './cameraDamping.ts'

const MIN_DISTANCE = 6
const MAX_DISTANCE = 60

/**
 * Ajusta campo de visão e distância à proporção da tela (physics/framing.ts).
 * Na primeira vez a câmera vai para a distância da regra; depois (girar o
 * aparelho, redimensionar a janela) a distância muda na mesma proporção que a
 * da regra, para não desfazer o zoom de quem já aproximou ou afastou.
 * Devolve a distância da regra usada.
 */
function applyFraming(camera: Camera, aspect: number, previous: number | null) {
  if (!(camera instanceof PerspectiveCamera)) return previous
  const distance = framingDistance(aspect)
  camera.fov = framingFov(aspect, distance)
  camera.updateProjectionMatrix()
  const current = camera.position.length()
  const target = previous === null ? distance : (current * distance) / previous
  camera.position.multiplyScalar(MathUtils.clamp(target, MIN_DISTANCE, MAX_DISTANCE) / current)
  camera.updateMatrixWorld()
  return distance
}

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const framed = useRef<number | null>(null)

  // Antes do primeiro quadro com essa proporção de tela.
  useLayoutEffect(() => {
    framed.current = applyFraming(camera, width / height, framed.current)
  }, [camera, width, height])

  // Prioridade -2: antes do update do OrbitControls (-1), que aplica o
  // amortecimento com o fator deste quadro (veja cameraDamping.ts).
  useFrame((_, delta) => {
    if (controls.current) controls.current.dampingFactor = dampingFactor(delta)
  }, -2)

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 0, 0]}
      enablePan={false}
      enableDamping
      dampingFactor={DAMPING_AT_60}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
    />
  )
}
