// Ajuste de qualidade do renderizador com cache (SPEC 6). São dois botões
// separados, cada um medido só nos quadros que dependem dele:
//   - em movimento: o divisor da resolução do traçado e os passos por raio,
//     medidos nos quadros em que a câmera andou e a cache pequena foi refeita;
//   - parado: o dpr do canvas (resolução da pintura, do pós-processamento e
//     da imagem parada), medido nos quadros sem traçado nenhum.
// Os quadros em que a imagem parada está sendo refinada não entram em nenhum:
// o tamanho das faixas já se ajusta sozinho (nextRefineRows).

/** Níveis de qualidade: os mesmos campos do store (Quality). */
export type Levels = { dpr: number; steps: number; motionDiv: number }

// Limites do SPEC (seção 6).
export const MIN_DPR = 0.5
export const MAX_DPR = 1.5
export const DPR_STEP = 0.25
export const MIN_STEPS = 120
export const MAX_STEPS = 300
export const STEPS_STEP = 40
/** Divisores por eixo da resolução do traçado em movimento, do mais fino ao mais grosso. */
export const MOTION_DIVS = [1, 1.5, 2, 3, 4]

// Quantas vezes um botão pode trocar de sentido (subir depois de descer ou o
// contrário) antes de parar de se ajustar, no nível mais baixo dos dois.
const MAX_REVERSALS = 3
// Quadros de cada tipo por medida.
const WINDOW = { motion: 20, idle: 30 }
// Quadros mais longos que isso (em segundos) não entram na medida: são a aba
// voltando depois de oculta ou um shader compilando, não o custo do render.
const MAX_FRAME_TIME = 0.25

/**
 * Faixa de fps: abaixo da primeira a qualidade cai, acima da segunda ela
 * sobe. Meta do SPEC: 60 fps no desktop e 30 ou mais no celular.
 */
export function fpsBounds(mobile: boolean, refresh: number): [number, number] {
  return mobile ? [28, Math.min(50, refresh * 0.9)] : [50, Math.min(100, refresh) * 0.95]
}

/**
 * Ponto de partida. No celular, o canvas a 75% da tela física por eixo (até
 * o teto de maxDprFor) e o movimento a 1/3 disso; no desktop, o canvas no dpr
 * da tela e o movimento a 1/1,5. A imagem parada sempre usa MAX_STEPS;
 * `steps` é o do movimento.
 */
export function initialLevels(mobile: boolean, devicePixelRatio: number): Levels {
  const clampDpr = (x: number, max: number) => Math.min(max, Math.max(MIN_DPR, x))
  return mobile
    ? { dpr: clampDpr(0.75 * devicePixelRatio, maxDprFor(true, devicePixelRatio)), steps: 160, motionDiv: 3 }
    : { dpr: clampDpr(devicePixelRatio, MAX_DPR), steps: MAX_STEPS, motionDiv: 1.5 }
}

// Movimento pesado: primeiro a resolução (em movimento a imagem já sai
// suavizada) e só depois os passos, que mudam o resultado perto do anel.
export function lowerMotion(q: Levels): Levels {
  const i = MOTION_DIVS.indexOf(q.motionDiv)
  if (i < MOTION_DIVS.length - 1) return { ...q, motionDiv: MOTION_DIVS[i + 1] }
  return { ...q, steps: Math.max(MIN_STEPS, q.steps - STEPS_STEP) }
}

// Movimento sobrando: desfaz na ordem inversa, passos primeiro.
export function raiseMotion(q: Levels): Levels {
  if (q.steps < MAX_STEPS) return { ...q, steps: Math.min(MAX_STEPS, q.steps + STEPS_STEP) }
  const i = MOTION_DIVS.indexOf(q.motionDiv)
  if (i > 0) return { ...q, motionDiv: MOTION_DIVS[i - 1] }
  return q
}

export function lowerStill(q: Levels): Levels {
  return { ...q, dpr: Math.max(MIN_DPR, q.dpr - DPR_STEP) }
}

export function raiseStill(q: Levels, maxDpr = MAX_DPR): Levels {
  return { ...q, dpr: Math.min(maxDpr, q.dpr + DPR_STEP) }
}

/**
 * Teto do dpr no celular: a resolução física da tela (até dpr 2). Com o
 * bloom e o tone mapping numa passada só (Etapa 5.1), parado sobra tempo, e
 * a imagem parada fica nítida em vez de ampliada pelo navegador. No desktop,
 * o limite de sempre.
 */
export function maxDprFor(mobile: boolean, devicePixelRatio: number) {
  return mobile ? Math.max(MAX_DPR, Math.min(2, devicePixelRatio)) : MAX_DPR
}

const same = (a: Levels, b: Levels) => a.dpr === b.dpr && a.steps === b.steps && a.motionDiv === b.motionDiv

/** O que o quadro fez: refez a cache em movimento, refinou a imagem parada ou nada. */
export type FrameKind = 'motion' | 'refine' | 'idle'

type Knob = { last: 'up' | 'down' | null; reversals: number; locked: boolean }

export function createCachedQuality(mobile: boolean, maxDpr = MAX_DPR) {
  const windows = { motion: { frames: 0, time: 0 }, idle: { frames: 0, time: 0 } }
  const knobs: Record<'motion' | 'idle', Knob> = {
    motion: { last: null, reversals: 0, locked: false },
    idle: { last: null, reversals: 0, locked: false },
  }
  // Taxa de atualização da tela: o fps mais alto medido sem traçado (esses
  // quadros são baratos e costumam bater no limite da tela).
  let refresh = 60
  // Teto do dpr imposto pelo movimento (veja abaixo).
  let ceiling = maxDpr
  // Medidas de quadros parados terminadas desde a última troca de qualidade.
  let idleVerdicts = 0

  return {
    /**
     * Conta um quadro de dt segundos do tipo kind. Ao fechar uma medida,
     * devolve os níveis novos se a qualidade deve mudar, ou null.
     */
    frame(kind: FrameKind, dt: number, q: Levels): Levels | null {
      if (kind === 'refine' || dt > MAX_FRAME_TIME) return null
      const w = windows[kind]
      w.frames++
      w.time += dt
      if (w.frames < WINDOW[kind]) return null
      const fps = w.frames / w.time
      w.frames = 0
      w.time = 0
      if (kind === 'idle') {
        refresh = Math.max(refresh, Math.min(240, fps))
        idleVerdicts++
      }

      const [low, high] = fpsBounds(mobile, refresh)
      const direction = fps < low ? 'down' : fps > high ? 'up' : null
      if (!direction) return null
      let next =
        kind === 'motion'
          ? direction === 'down' ? lowerMotion(q) : raiseMotion(q)
          : direction === 'down' ? lowerStill(q) : raiseStill(q, ceiling)
      // Movimento lento com o movimento já no mínimo (divisor 4, 120 passos):
      // o que pesa é a resolução da tela (a pintura e o bloom), então desce o
      // dpr e ele vira teto, para o botão de parado não subir de novo.
      if (kind === 'motion' && direction === 'down' && same(next, q)) {
        next = lowerStill(q)
        ceiling = next.dpr
      }
      if (same(next, q)) return null

      const knob = knobs[kind]
      if (knob.locked) return null
      if (knob.last && knob.last !== direction) knob.reversals++
      knob.last = direction
      if (knob.reversals >= MAX_REVERSALS) {
        knob.locked = true
        if (direction === 'up') return null // trava no nível mais baixo dos dois
      }
      // Depois de uma troca, as medidas recomeçam do zero.
      windows.motion = { frames: 0, time: 0 }
      windows.idle = { frames: 0, time: 0 }
      idleVerdicts = 0
      return next
    },
    /**
     * A resolução da imagem parada já foi avaliada parada sem mudar: dá para
     * gastar tempo suavizando (antes disso, uma subida de dpr jogaria fora a
     * suavização feita).
     */
    stillSettled: () => idleVerdicts > 0,
  }
}

export type CachedQuality = ReturnType<typeof createCachedQuality>

/** Faixa mínima da imagem parada por quadro, em linhas. */
export const MIN_REFINE_ROWS = 2

/**
 * Linhas da imagem parada a traçar no próximo quadro, a partir do tempo dt
 * que o último quadro com refino levou e do tempo por quadro desejado
 * (budget). Sobe aos poucos enquanto cabe e cai pela metade quando passa.
 */
export function nextRefineRows(rows: number, dt: number, budget: number) {
  if (dt > budget * 1.3) return Math.max(MIN_REFINE_ROWS, Math.floor(rows / 2))
  if (dt < budget) return rows + Math.max(2, Math.floor(rows / 4))
  return rows
}
