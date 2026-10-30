import type { ShaderMaterial } from 'three'
import type { TraceOptions, CameraState } from '../physics/trace.ts'
import type { GpuProbe } from '../state/store.ts'

/** O traçado que está na tela: com que câmera, em que resolução e com que opções. */
export type TraceSnapshot = {
  camera: CameraState
  width: number
  height: number
  options: TraceOptions
}

/** O que a sonda de raio precisa do renderizador em uso. */
export type ProbeSource = {
  snapshot: () => TraceSnapshot | null
  /** ?debug: o que a GPU tem para o pixel (px, py) do traçado em exibição; null se não deu para ler. */
  readGpu: (px: number, py: number) => GpuProbe | null
}

export type RendererKind = 'legacy' | 'cached'

/**
 * Ponte entre o renderizador em uso e o resto da cena (sonda, diagnóstico),
 * sem passar pelo React. O renderizador preenche ao montar.
 */
export const sceneShared: {
  renderer: RendererKind | null
  /** Material com o autoteste do céu (uProbe = 2) na saída 0. */
  selfTestMaterial: ShaderMaterial | null
  probe: ProbeSource | null
  /** Quantos traçados completos da tela já foram feitos (o direto traça um por quadro). */
  traces: number
} = { renderer: null, selfTestMaterial: null, probe: null, traces: 0 }
