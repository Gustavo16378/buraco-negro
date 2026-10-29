/** Modo de depuração, ligado com ?debug na URL. */
export const DEBUG = new URLSearchParams(window.location.search).has('debug')
