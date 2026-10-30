const params = new URLSearchParams(window.location.search)

/** Modo de depuração, ligado com ?debug na URL. */
export const DEBUG = params.has('debug')

/** Renderizador direto (o de antes da cache), ligado com ?legacy na URL, para comparar. */
export const LEGACY = params.has('legacy')

/**
 * Céu com laços de verdade (compila mais rápido no Windows), ligado com
 * ?lacos na URL. Em teste: com ele a imagem ficou preta num Android (Mali),
 * então o padrão voltou ao céu de antes até saber o motivo (veja common.glsl).
 */
export const LOOPED_SKY = params.has('lacos')
