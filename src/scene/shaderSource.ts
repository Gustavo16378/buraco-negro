// Monta os shaders do buraco negro a partir dos pedaços em src/shaders/.
// Todos começam por common.glsl (uniforms e ruído) e usam as mesmas funções,
// para o renderizador direto (?legacy) e o com cache nunca divergirem.

import { GLSL3, ShaderMaterial } from 'three'
import { LOOPED_SKY } from '../debug.ts'
import { shaderDefines } from '../physics/constants.ts'
import bloomDownMain from '../shaders/bloomDown.frag.glsl?raw'
import bloomSourceMain from '../shaders/bloomSource.frag.glsl?raw'
import bloomUpMain from '../shaders/bloomUp.frag.glsl?raw'
import cacheDisk from '../shaders/cacheDisk.glsl?raw'
import common from '../shaders/common.glsl?raw'
import disk from '../shaders/disk.glsl?raw'
import vertex from '../shaders/fullscreen.vert.glsl?raw'
import gasMain from '../shaders/gas.frag.glsl?raw'
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

/** Renderizador com cache, pintura: a cada quadro, a partir da cache (e, na tela, bloom e tone mapping). */
export const paintShader = [common, disk, cacheDisk, paintMain].join('\n')

/** Renderizador com cache, fonte do bloom: a luz do disco, numa resolução menor. */
export const bloomSourceShader = [common, disk, cacheDisk, bloomSourceMain].join('\n')

/** Bloom, redução e ampliação (só texturas, sem os pedaços do buraco negro). */
export const bloomDownShader = bloomDownMain
export const bloomUpShader = bloomUpMain

/** Renderizador com cache, campo de ruído de uma cópia do gás: só quando ela vai reiniciar. */
export const gasShader = [common, disk, gasMain].join('\n')

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
    // ?lacos: céu com laços de verdade (veja common.glsl).
    defines: LOOPED_SKY ? { ...shaderDefines, LOOPED_SKY: '' } : shaderDefines,
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  })
}
