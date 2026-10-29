import type { ShaderMaterial } from 'three'

/**
 * Material do buraco negro, para outras partes da cena lerem os uniforms em
 * uso no quadro (câmera, passos, modo) sem passar pelo React. É assim que a
 * sonda traça o raio com exatamente as mesmas entradas do shader.
 */
export const sceneShared: { material: ShaderMaterial | null } = { material: null }
