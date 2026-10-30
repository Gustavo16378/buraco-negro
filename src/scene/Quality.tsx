import { PerformanceMonitor } from '@react-three/drei'
import { useRef } from 'react'
import { IS_MOBILE, useStore, type Quality as QualityState } from '../state/store.ts'
import { DPR_STEP, MAX_DPR, MAX_STEPS, MIN_DPR, MIN_STEPS, STEPS_STEP, fpsBounds } from './cachedQuality.ts'

// Ajuste de qualidade do renderizador direto (?legacy). O com cache tem o
// dele, em cachedQuality.ts.

// Quantas vezes a qualidade pode trocar de sentido (subir depois de descer ou
// o contrário) antes de parar de se ajustar.
const MAX_REVERSALS = 3

const bounds = (refreshrate: number) => fpsBounds(IS_MOBILE, refreshrate)

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
