import { MathUtils } from 'three'
import { create } from 'zustand'
import type { ProbeReading } from '../physics/probe.ts'
import type { Destination } from '../physics/trace.ts'
import type { Levels } from '../scene/cachedQuality.ts'
import type { FrameTimes } from '../scene/frameTimer.ts'
import type { TracePhase } from '../scene/shared.ts'

/** Interstellar: disco simétrico, sem desvio de cor. Física real: Doppler e desvio gravitacional. */
export type Mode = 'interstellar' | 'real'

export type ShadowMeasure = {
  camDist: number // distância da câmera ao centro, em r_s
  measuredDeg: number // raio angular da sombra medido na tela
  expectedDeg: number // raio angular esperado pela fórmula do observador parado
  expectedRadiusCss: number // raio esperado em pixels CSS, para desenhar o círculo de conferência
}

/** Idioma da interface. */
export type Lang = 'pt' | 'en'

const LANG_KEY = 'idioma'

// Idioma salvo da última visita ou, na primeira, o do navegador. O
// localStorage pode não existir (aba anônima, bloqueio), então tudo em try.
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'pt' || saved === 'en') return saved
  } catch {
    // sem acesso ao armazenamento: segue para o idioma do navegador
  }
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

/** Ponto da sonda de raio, em pixels CSS a partir do canto superior esquerdo do canvas. */
export type ProbePoint = { x: number; y: number }

/** O que o shader calculou no pixel da sonda (passada de verificação do ?debug). */
export type GpuProbe = { destination: Destination; r: number; g: number; opacity: number }

/** Precisão de um tipo no fragment shader: bits de mantissa e expoente máximo (getShaderPrecisionFormat). */
export type PrecisionFormat = { precision: number; rangeMax: number }

/** Diagnóstico do aparelho para o ?debug: o que a GPU oferece e se ela calcula o céu como a CPU. */
export type DeviceInfo = {
  gpu: string
  highFloat: PrecisionFormat
  mediumFloat: PrecisionFormat
  highInt: PrecisionFormat
  /** Precisão que o three escolheu para os shaders. */
  shaderPrecision: string
  maxTextureSize: number
  /** Formato em que dá para ler resultados da GPU; null se nenhum. */
  readback: 'float32' | 'float16' | null
  /** Autoteste do céu: valor da GPU e da CPU (null se não deu para ler da GPU). */
  selfTest: { hash: [number, number]; noise: [number, number]; fbm: [number, number]; milkyWay: number } | null
}

/** Resolução interna de renderização e da tela física, para o ?debug. */
export type RenderInfo = {
  width: number
  height: number
  physicalWidth: number
  physicalHeight: number
  devicePixelRatio: number
  /** Renderizador em uso: direto (?legacy) ou com cache. */
  renderer: 'legacy' | 'cached' | null
  /** Resolução do traçado em exibição (no com cache, a da cache). */
  traceWidth: number
  traceHeight: number
  /** Traçados completos da tela por segundo (no direto, um por quadro). */
  tracesPerSecond: number
  /** Só no com cache: fase do traçado e quanto da imagem parada já foi traçado (0 a 1). */
  phase: TracePhase | null
  refine: number
  /** Só no com cache: quanto da suavização da imagem parada já foi feito (0 a 1). */
  smoothing: number
  /** Tempo de cada parte do quadro na última amostra, em ms (frameTimer.ts). */
  times: FrameTimes | null
}

/** Resolução de renderização (dpr) e passos de integração por raio. */
/**
 * dpr do canvas, passos por raio e divisor por eixo da resolução do traçado em
 * movimento. No renderizador com cache, steps vale só para o movimento (a
 * imagem parada usa sempre o máximo) e quem ajusta é cachedQuality.ts; no
 * direto, motionDiv não é usado e quem ajusta é Quality.tsx.
 */
export type Quality = Levels

/** Celular ou tablet: a tela de toque é o ponteiro principal. */
export const IS_MOBILE = window.matchMedia('(pointer: coarse)').matches

// SPEC 6, renderizador direto: o celular começa com dpr 0,75 e 160 passos; o
// desktop, no dpr da tela (limitado a 0,5 a 1,5) e 300 passos. O com cache
// troca pelo ponto de partida dele ao montar (initialLevels).
const initialQuality: Quality = IS_MOBILE
  ? { dpr: 0.75, steps: 160, motionDiv: 3 }
  : { dpr: MathUtils.clamp(window.devicePixelRatio || 1, 0.5, 1.5), steps: 300, motionDiv: 1.5 }

type State = {
  lang: Lang
  setLang: (lang: Lang) => void
  mode: Mode
  setMode: (mode: Mode) => void
  probe: ProbePoint | null
  setProbe: (probe: ProbePoint | null) => void
  probeReading: ProbeReading | null
  probeGpu: GpuProbe | null
  setProbeResult: (reading: ProbeReading, gpu: GpuProbe | null) => void
  quality: Quality
  setQuality: (quality: Quality) => void
  /** Shaders compilados e a primeira imagem do buraco negro pronta: some a tela de carregamento. */
  ready: boolean
  setReady: (ready: boolean) => void
  /**
   * O que impediu o buraco negro de aparecer (o navegador não criou o WebGL2,
   * a GPU parou, um shader não compilou), com o detalhe técnico. A tela de
   * carregamento mostra isso em vez de ficar preta.
   */
  failure: string | null
  setFailure: (failure: string) => void
  fps: number
  setFps: (fps: number) => void
  device: DeviceInfo | null
  setDevice: (device: DeviceInfo) => void
  render: RenderInfo | null
  setRender: (render: RenderInfo) => void
  shadow: ShadowMeasure | null
  setShadow: (shadow: ShadowMeasure) => void
}

export const useStore = create<State>()((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // sem armazenamento a escolha vale só até recarregar a página
    }
    set({ lang })
  },
  mode: 'interstellar',
  setMode: (mode) => set({ mode }),
  probe: null,
  // Um ponto novo apaga a leitura anterior, para o painel não mostrar o raio velho.
  setProbe: (probe) => set({ probe, probeReading: null, probeGpu: null }),
  probeReading: null,
  probeGpu: null,
  setProbeResult: (probeReading, probeGpu) => set({ probeReading, probeGpu }),
  quality: initialQuality,
  setQuality: (quality) => set({ quality }),
  ready: false,
  setReady: (ready) => set({ ready }),
  failure: null,
  // Guarda a primeira falha: as seguintes costumam ser consequência dela.
  setFailure: (failure) => set((s) => (s.failure ? {} : { failure })),
  fps: 0,
  setFps: (fps) => set({ fps }),
  device: null,
  setDevice: (device) => set({ device }),
  render: null,
  setRender: (render) => set({ render }),
  shadow: null,
  setShadow: (shadow) => set({ shadow }),
}))
