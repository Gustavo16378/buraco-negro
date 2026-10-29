import { Canvas } from '@react-three/fiber'
import { MathUtils } from 'three'
import { DEBUG } from './debug.ts'
import { BlackHole } from './scene/BlackHole.tsx'
import { CameraRig } from './scene/CameraRig.tsx'
import { DebugPanel } from './ui/DebugPanel.tsx'
import { ModeToggle } from './ui/ModeToggle.tsx'

// Posição final da chegada (SPEC 1): ~22 r_s, ~8° acima do plano do disco.
const CAM_DIST = 22
const CAM_INCL = MathUtils.degToRad(8)

export default function App() {
  return (
    <div className="fixed inset-0 bg-black">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{
          fov: 45,
          near: 0.1,
          far: 200,
          position: [0, CAM_DIST * Math.sin(CAM_INCL), CAM_DIST * Math.cos(CAM_INCL)],
        }}
      >
        <BlackHole />
        <CameraRig />
      </Canvas>
      <ModeToggle />
      {DEBUG && <DebugPanel />}
    </div>
  )
}
