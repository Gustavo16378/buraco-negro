import { MathUtils } from 'three'
import { create } from 'zustand'

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
  quality: Quality
  setQuality: (quality: Quality) => void
  fps: number
  setFps: (fps: number) => void
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
  quality: initialQuality,
  setQuality: (quality) => set({ quality }),
  fps: 0,
  setFps: (fps) => set({ fps }),
  shadow: null,
  setShadow: (shadow) => set({ shadow }),
}))
