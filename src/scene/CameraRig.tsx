import { OrbitControls } from '@react-three/drei'

export function CameraRig() {
  return (
    <OrbitControls
      makeDefault
      target={[0, 0, 0]}
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
      minDistance={6}
      maxDistance={60}
    />
  )
}
