// Monta os shaders do buraco negro a partir dos pedaços em src/shaders/.
// Todos começam por common.glsl (uniforms e ruído) e usam as mesmas funções,
// para o renderizador direto (?legacy) e o com cache nunca divergirem.

import { GLSL3, ShaderMaterial } from 'three'
import { shaderDefines } from '../physics/constants.ts'
import common from '../shaders/common.glsl?raw'
import disk from '../shaders/disk.glsl?raw'
import vertex from '../shaders/fullscreen.vert.glsl?raw'
import legacyMain from '../shaders/legacy.frag.glsl?raw'
import paintMain from '../shaders/paint.frag.glsl?raw'
import raytrace from '../shaders/raytrace.glsl?raw'
import sky from '../shaders/sky.glsl?raw'
import traceMain from '../shaders/trace.frag.glsl?raw'
import type { BlackHoleUniforms } from './blackHoleUniforms.ts'

export const vertexShader = vertex

/** Renderizador direto: traça e pinta cada pixel a cada quadro. */
export const legacyShader = [common, raytrace, sky, disk, legacyMain].join('\n')

/** Renderizador com cache, traçado: só quando a câmera muda. */
export const traceShader = [common, raytrace, sky, disk, traceMain].join('\n')

/** Renderizador com cache, pintura: a cada quadro, a partir da cache. */
export const paintShader = [common, disk, paintMain].join('\n')

/**
 * Material de quad de tela cheia com um dos shaders acima. Feito aqui, e não
 * com <shaderMaterial uniforms={...}> no JSX, porque o R3F copia cada uniform
 * para um objeto novo: um valor numérico mudado depois (tempo, modo, campo de
 * visão) não chegaria ao shader, e os materiais de um mesmo renderizador
 * deixariam de compartilhar os uniforms.
 */
export function createBlackHoleMaterial(fragmentShader: string, uniforms: BlackHoleUniforms) {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    defines: shaderDefines,
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  })
}
