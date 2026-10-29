import { Canvas } from '@react-three/fiber'
import { useSyncExternalStore } from 'react'
import { MathUtils } from 'three'
import { DEBUG } from './debug.ts'
import { BlackHole } from './scene/BlackHole.tsx'
import { CameraRig } from './scene/CameraRig.tsx'
import { Effects } from './scene/Effects.tsx'
import { Quality } from './scene/Quality.tsx'
import { useStore } from './state/store.ts'
import { DebugPanel } from './ui/DebugPanel.tsx'
import { ModeToggle } from './ui/ModeToggle.tsx'

// Posição final da chegada (SPEC 1): ~22 r_s, ~8° acima do plano do disco.
const CAM_DIST = 22
const CAM_INCL = MathUtils.degToRad(8)

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

const isPageVisible = () => document.visibilityState === 'visible'

export default function App() {
  const dpr = useStore((s) => s.quality.dpr)
  // Aba oculta: para de renderizar (SPEC 6).
  const visible = useSyncExternalStore(subscribeVisibility, isPageVisible)

  return (
    <div className="fixed inset-0 bg-black">
      <Canvas
        dpr={dpr}
        frameloop={visible ? 'always' : 'never'}
        // Sem tone mapping no renderizador: o ACES fica só no fim da cadeia de
        // pós-processamento (Effects.tsx), aplicado uma vez.
        flat
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
        <Effects />
        <Quality />
      </Canvas>
      <ModeToggle />
      {DEBUG && <DebugPanel />}
    </div>
  )
}
