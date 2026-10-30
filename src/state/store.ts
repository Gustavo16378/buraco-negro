import { MathUtils } from 'three'
import { create } from 'zustand'
import type { ProbeReading } from '../physics/probe.ts'
import type { Destination } from '../physics/trace.ts'

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
}

/** Resolução de renderização (dpr) e passos de integração por raio. */
export type Quality = { dpr: number; steps: number }

/** Celular ou tablet: a tela de toque é o ponteiro principal. */
export const IS_MOBILE = window.matchMedia('(pointer: coarse)').matches

// SPEC 6: o celular começa com dpr 0,75 e 160 passos; o desktop, no dpr da
// tela (limitado a 0,5 a 1,5) e 300 passos. O PerformanceMonitor ajusta depois.
const initialQuality: Quality = IS_MOBILE
  ? { dpr: 0.75, steps: 160 }
  : { dpr: MathUtils.clamp(window.devicePixelRatio || 1, 0.5, 1.5), steps: 300 }

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
  fps: 0,
  setFps: (fps) => set({ fps }),
  device: null,
  setDevice: (device) => set({ device }),
  render: null,
  setRender: (render) => set({ render }),
  shadow: null,
  setShadow: (shadow) => set({ shadow }),
}))
