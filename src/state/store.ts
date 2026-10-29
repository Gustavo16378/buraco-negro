import { create } from 'zustand'

export type ShadowMeasure = {
  camDist: number // distância da câmera ao centro, em r_s
  measuredDeg: number // raio angular da sombra medido na tela
  expectedDeg: number // raio angular esperado pela fórmula do observador parado
  expectedRadiusCss: number // raio esperado em pixels CSS, para desenhar o círculo de conferência
}

type State = {
  shadow: ShadowMeasure | null
  setShadow: (shadow: ShadowMeasure) => void
}

export const useStore = create<State>()((set) => ({
  shadow: null,
  setShadow: (shadow) => set({ shadow }),
}))
