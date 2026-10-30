import type { ShaderMaterial } from 'three'
import type { FrameTimer } from './frameTimer.ts'
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

/** Renderizador com cache: em movimento, refinando a imagem parada, ou com ela na tela. */
export type TracePhase = 'motion' | 'refining' | 'still'

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
  /** Só no com cache: fase do traçado e quanto da imagem parada já foi traçado (0 a 1). */
  phase: TracePhase | null
  refine: number
  /** Só no com cache: quanto da suavização da imagem parada já foi feito (0 a 1). */
  smoothing: number
  /** ?debug: medida do tempo de cada parte do quadro. */
  frameTimer: FrameTimer | null
} = { renderer: null, selfTestMaterial: null, probe: null, traces: 0, phase: null, refine: 0, smoothing: 0, frameTimer: null }
