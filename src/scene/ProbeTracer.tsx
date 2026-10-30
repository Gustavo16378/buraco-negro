import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MathUtils } from 'three'
import { DEBUG } from '../debug.ts'
import { readProbe } from '../physics/probe.ts'
import { useStore } from '../state/store.ts'
import { sceneShared } from './shared.ts'

// Um toque vira sonda se o dedo (ou o mouse) andar menos que isso e soltar
// antes desse tempo. Acima disso é arraste, e a câmera gira.
const TAP_SLOP = 6 // px
const TAP_TIME = 300 // ms
// O painel é atualizado no máximo 10 vezes por segundo.
const UPDATE_EVERY = 0.1 // s

export function ProbeTracer() {
  const gl = useThree((s) => s.gl)
  const elapsed = useRef(UPDATE_EVERY)

  // Toque curto cria a sonda; arraste e pinça continuam com o OrbitControls.
  // Os ouvintes ficam na fase de captura do elemento que envolve o canvas, então
  // rodam antes dos do OrbitControls (que estão no canvas).
  useEffect(() => {
    const canvas = gl.domElement
    const host = canvas.parentElement
    if (!host) return
    const pointers = new Map<number, { x: number; y: number; t: number; tap: boolean }>()

    const down = (e: PointerEvent) => {
      if (e.target !== canvas) return
      // Um segundo dedo (pinça) cancela o toque de todos.
      for (const p of pointers.values()) p.tap = false
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp, tap: pointers.size === 0 && e.button === 0 })
    }
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (!p || !p.tap) return
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < TAP_SLOP) {
        // Zona morta: o tremor do dedo num toque não chega ao OrbitControls,
        // então a câmera não gira.
        e.stopPropagation()
        return
      }
      p.tap = false
    }
    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      pointers.delete(e.pointerId)
      if (!p || !p.tap || e.timeStamp - p.t > TAP_TIME) return
      const rect = canvas.getBoundingClientRect()
      useStore.getState().setProbe({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    const cancel = (e: PointerEvent) => pointers.delete(e.pointerId)

    host.addEventListener('pointerdown', down, true)
    host.addEventListener('pointermove', move, true)
    host.addEventListener('pointerup', up, true)
    host.addEventListener('pointercancel', cancel, true)
    return () => {
      host.removeEventListener('pointerdown', down, true)
      host.removeEventListener('pointermove', move, true)
      host.removeEventListener('pointerup', up, true)
      host.removeEventListener('pointercancel', cancel, true)
    }
  }, [gl])

  // Esc fecha a sonda.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().setProbe(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // Prioridade 0,5: roda depois do BlackHole (0), que atualiza o traçado do
  // quadro, e antes do pós-processamento (1), que desenha a tela. Assim o
  // raio da CPU usa exatamente as entradas do traçado em exibição.
  useFrame((_, delta) => {
    const point = useStore.getState().probe
    const snapshot = sceneShared.probe?.snapshot()
    if (!point || !snapshot) {
      elapsed.current = UPDATE_EVERY // uma sonda nova aparece já no quadro seguinte
      return
    }
    elapsed.current += delta
    if (elapsed.current < UPDATE_EVERY) return
    elapsed.current = 0

    // Pixel do traçado sob o ponto, com origem embaixo (como no shader). O
    // traçado pode ter resolução diferente da tela.
    const canvas = gl.domElement
    const { width, height } = snapshot
    const px = MathUtils.clamp(Math.floor((point.x * width) / canvas.clientWidth), 0, width - 1)
    const py = MathUtils.clamp(height - 1 - Math.floor((point.y * height) / canvas.clientHeight), 0, height - 1)

    const reading = readProbe(snapshot.camera, px, py, width, height, snapshot.options)
    // Conferência com o que a GPU calculou para o mesmo pixel (?debug).
    const gpu = DEBUG ? (sceneShared.probe?.readGpu(px, py) ?? null) : null
    useStore.getState().setProbeResult(reading, gpu)
  }, 0.5)

  return null
}
