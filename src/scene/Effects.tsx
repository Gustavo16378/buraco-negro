import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { BLOOM } from './bloomSettings.ts'

// Pós-processamento do renderizador direto (?legacy). O com cache faz o
// próprio, mais barato (bloom.ts e paint.frag.glsl).
// O shader escreve cor linear em HDR (acima de 1 no disco). A cadeia trabalha
// em ponto flutuante: o bloom pega só o que passa de ~0,8 (disco, anel de
// fótons e as estrelas mais fortes) e o ACES comprime tudo no fim.
// Sem multisampling: a cena é um único quad de tela cheia, não há borda de
// geometria para suavizar, e a medida do ?debug precisa ler o buffer direto.
export function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        mipmapBlur
        radius={BLOOM.radius}
        luminanceThreshold={BLOOM.threshold}
        luminanceSmoothing={BLOOM.smoothing}
        intensity={BLOOM.intensity}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
