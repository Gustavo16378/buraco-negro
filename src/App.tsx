import { Canvas } from '@react-three/fiber'
import { useEffect, useSyncExternalStore } from 'react'
import { DEBUG } from './debug.ts'
import { CAM_INCL, LANDSCAPE_DIST } from './physics/framing.ts'
import { useT } from './i18n/index.ts'
import { BlackHole } from './scene/BlackHole.tsx'
import { CameraRig } from './scene/CameraRig.tsx'
import { Effects } from './scene/Effects.tsx'
import { DeviceDiagnostics } from './scene/DeviceDiagnostics.tsx'
import { ProbeTracer } from './scene/ProbeTracer.tsx'
import { watchRenderer } from './scene/watchRenderer.ts'
import { useStore } from './state/store.ts'
import { CanvasBoundary } from './ui/CanvasBoundary.tsx'
import { DebugPanel } from './ui/DebugPanel.tsx'
import { LangToggle } from './ui/LangToggle.tsx'
import { Loading } from './ui/Loading.tsx'
import { ModeToggle } from './ui/ModeToggle.tsx'
import { ProbeMarker } from './ui/ProbeMarker.tsx'
import { ProbePanel } from './ui/ProbePanel.tsx'

// Posição final da chegada (SPEC 1): 8° acima do plano do disco. A distância
// e o campo de visão saem da proporção da tela (CameraRig.tsx).
const CAM_DIST = LANDSCAPE_DIST

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

const isPageVisible = () => document.visibilityState === 'visible'

export default function App() {
  const t = useT()
  const dpr = useStore((s) => s.quality.dpr)
  // Aba oculta: para de renderizar (SPEC 6).
  const visible = useSyncExternalStore(subscribeVisibility, isPageVisible)

  // Idioma da página e título da aba acompanham a escolha (leitores de tela
  // usam o lang para escolher a pronúncia).
  useEffect(() => {
    document.documentElement.lang = t.locale
    document.title = t.title
  }, [t])

  return (
    <div className="fixed inset-0 bg-black">
      <CanvasBoundary>
        <Canvas
          dpr={dpr}
          frameloop={visible ? 'always' : 'never'}
          // Sem tone mapping no renderizador: o ACES fica só no fim da cadeia de
          // pós-processamento (Effects.tsx), aplicado uma vez.
          flat
          gl={{ antialias: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => watchRenderer(gl)}
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
          <ProbeTracer />
          {DEBUG && <DeviceDiagnostics />}
        </Canvas>
      </CanvasBoundary>
      <ProbeMarker />
      <ModeToggle />
      <LangToggle />
      <ProbePanel />
      {DEBUG && <DebugPanel />}
      <Loading />
    </div>
  )
}
