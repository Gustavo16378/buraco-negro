// Parâmetros do bloom, os mesmos no renderizador direto (Effects.tsx, com o
// postprocessing) e no com cache (bloom.ts).
//   threshold e smoothing: só o que passa de ~0,8 (linear) brilha.
//   radius 0,4: com o padrão (0,85) o brilho do disco cobria a sombra
//   inteira, que ficava cinza (64 de 255 no centro); com 0,4 ela fica preta.
export const BLOOM = { threshold: 0.8, smoothing: 0.1, intensity: 1.2, radius: 0.4 }
