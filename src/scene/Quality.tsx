import { PerformanceMonitor } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { DEBUG } from '../debug.ts'
import { IS_MOBILE, useStore, type Quality as QualityState } from '../state/store.ts'

// Limites do SPEC (seção 6).
const MIN_DPR = 0.5
const MAX_DPR = 1.5
const DPR_STEP = 0.25
const MIN_STEPS = 120
const MAX_STEPS = 300
const STEPS_STEP = 40

// Quantas vezes a qualidade pode trocar de sentido (subir depois de descer ou
// o contrário) antes de parar de se ajustar.
const MAX_REVERSALS = 3

// Faixas de fps: abaixo da primeira a qualidade cai, acima da segunda ela sobe.
// Meta do SPEC: 60 fps no desktop e 30 ou mais no celular.
const bounds = (refreshrate: number): [number, number] =>
  IS_MOBILE ? [28, Math.min(50, refreshrate * 0.9)] : [50, Math.min(100, refreshrate) * 0.95]

// Desempenho ruim: baixa primeiro o dpr e só depois os passos.
function lower(q: QualityState): QualityState {
  if (q.dpr > MIN_DPR) return { ...q, dpr: Math.max(MIN_DPR, q.dpr - DPR_STEP) }
  return { ...q, steps: Math.max(MIN_STEPS, q.steps - STEPS_STEP) }
}

// Desempenho sobrando: desfaz na ordem inversa, passos primeiro e dpr depois.
function raise(q: QualityState): QualityState {
  if (q.steps < MAX_STEPS) return { ...q, steps: Math.min(MAX_STEPS, q.steps + STEPS_STEP) }
  return { ...q, dpr: Math.min(MAX_DPR, q.dpr + DPR_STEP) }
}

export function Quality() {
  const adjust = useRef({ last: null as 'up' | 'down' | null, reversals: 0, locked: false })
  const frames = useRef({ count: 0, elapsed: 0 })

  // fps para o painel de depuração, medido a cada meio segundo.
  useFrame((_, delta) => {
    if (!DEBUG) return
    const f = frames.current
    f.count++
    f.elapsed += delta
    if (f.elapsed >= 0.5) {
      useStore.getState().setFps(f.count / f.elapsed)
      f.count = 0
      f.elapsed = 0
    }
  })

  // O PerformanceMonitor do drei conta toda mudança como "flipflop", e um
  // aparelho lento precisa de vários degraus seguidos para baixo. Por isso o
  // limite de oscilação é feito aqui: só conta quando o sentido inverte. Ao
  // atingir o limite, a qualidade fica no nível mais baixo dos dois entre os
  // quais estava oscilando.
  const change = (direction: 'up' | 'down') => {
    const a = adjust.current
    if (a.locked) return
    if (a.last && a.last !== direction) a.reversals++
    a.last = direction
    const { quality, setQuality } = useStore.getState()
    if (a.reversals >= MAX_REVERSALS) {
      a.locked = true
      if (direction === 'down') setQuality(lower(quality))
      return
    }
    setQuality(direction === 'down' ? lower(quality) : raise(quality))
  }

  return (
    <PerformanceMonitor
      bounds={bounds}
      // Uma decisão a cada 8 amostras de 250 ms; basta que 60% delas estejam
      // fora da faixa (o fps oscila bastante de uma amostra para outra).
      iterations={8}
      threshold={0.6}
      onDecline={() => change('down')}
      onIncline={() => change('up')}
    />
  )
}
