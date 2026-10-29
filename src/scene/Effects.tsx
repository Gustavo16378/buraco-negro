import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

// O shader escreve cor linear em HDR (acima de 1 no disco). A cadeia trabalha
// em ponto flutuante: o bloom pega só o que passa de ~0,8 (disco, anel de
// fótons e as estrelas mais fortes) e o ACES comprime tudo no fim.
// Raio do bloom 0,4: com o padrão (0,85) o brilho do disco cobria a sombra
// inteira, que ficava cinza (64 de 255 no centro); com 0,4 ela fica preta.
// Sem multisampling: a cena é um único quad de tela cheia, não há borda de
// geometria para suavizar, e a medida do ?debug precisa ler o buffer direto.
export function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur radius={0.4} luminanceThreshold={0.8} luminanceSmoothing={0.1} intensity={1.2} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
