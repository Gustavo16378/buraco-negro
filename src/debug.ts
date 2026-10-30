const params = new URLSearchParams(window.location.search)

/** Modo de depuração, ligado com ?debug na URL. */
export const DEBUG = params.has('debug')

/** Renderizador direto (o de antes da cache), ligado com ?legacy na URL, para comparar. */
export const LEGACY = params.has('legacy')
