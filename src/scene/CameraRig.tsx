import { OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { DAMPING_AT_60, dampingFactor } from './cameraDamping.ts'

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null)

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
      minDistance={6}
      maxDistance={60}
    />
  )
}
