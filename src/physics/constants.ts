// Constantes do traçado de raios, num lugar só. O integrador na CPU
// (trace.ts) usa daqui, e o shader recebe as mesmas como #define
// (shaderDefines), para os dois nunca divergirem.
// Unidades geométricas: r_s = 1, M = 0,5, tempo em r_s / c.

/** Parâmetro de impacto crítico, (3√3/2) r_s: abaixo disso a luz cai no buraco. */
export const B_C = (3 * Math.sqrt(3)) / 2

/** Além desse raio, saindo, a luz já não curva de forma visível: amostra o céu. */
export const ESCAPE_R = 60

// Passo adaptativo: dt = clamp(DT_FACTOR · r, MIN_DT, MAX_DT). O teto era 1,5;
// com 5 (só atingido além de r ≈ 62) são 18% menos passos na vista inicial, a
// borda da sombra não muda e a direção final muda menos de 5 segundos de arco.
export const DT_FACTOR = 0.08
export const MIN_DT = 0.02
export const MAX_DT = 5

/** Teto fixo do laço no shader; o limite em uso é uMaxSteps (ajustado pelo desempenho). */
export const MAX_LOOP_STEPS = 1000

/** Opacidade acumulada a partir da qual o que está atrás do disco não aparece. */
export const OPACITY_STOP = 0.99

/** Disco: borda interna na ISCO e borda externa (valores iniciais dos uniforms). */
export const DISK_IN = 3
export const DISK_OUT = 12

/** Larguras (em r_s) em que a opacidade do disco sobe na borda interna e cai na externa. */
export const DISK_FADE_IN = 0.4
export const DISK_FADE_OUT = 2

/**
 * Temperatura de pico do disco, em kelvin. O SPEC partia de ~7000 K, mas esse
 * branco levemente azulado, depois do ACES (que tira saturação dos brilhos
 * fortes), deixava o disco cinza-prateado. 4800 K dá o branco quente no centro
 * e o dourado nas bordas do filme.
 */
export const DISK_TEMP = 4800

/** Máximo de f(x) = x^-3/4 · (1 - x^-1/2)^1/4, em x = 49/36: normaliza o perfil de temperatura. */
export const T_PROFILE_PEAK = 0.487871

/** Tempo da simulação por segundo de tela, em r_s / c (antes do controle de velocidade). */
export const TIME_SCALE = 4

/** Período orbital do gás na ISCO (r = 3), visto de longe, em r_s / c: 2π / sqrt(0,5 / 27). */
export const ISCO_PERIOD = (2 * Math.PI) / Math.sqrt(0.5 / 27)

// Constantes físicas (SI), para converter r_s e r_s / c em km e segundos.
export const G = 6.6743e-11 // m³ / (kg · s²)
export const C = 299_792_458 // m / s
export const M_SUN = 1.98847e30 // kg

/** Massas de referência do seletor, em massas solares. */
export const MASSES = {
  sun: 1,
  sgrA: 4.3e6,
  gargantua: 1e8,
  m87: 6.5e9,
} as const

export type MassId = keyof typeof MASSES

// Literal float de GLSL: "60" vira "60.0".
const glslFloat = (x: number) => {
  const s = String(x)
  return /[.e]/.test(s) ? s : `${s}.0`
}

/** As constantes que o shader usa, como #define. */
export const shaderDefines = {
  ESCAPE_R: glslFloat(ESCAPE_R),
  DT_FACTOR: glslFloat(DT_FACTOR),
  MIN_DT: glslFloat(MIN_DT),
  MAX_DT: glslFloat(MAX_DT),
  MAX_LOOP_STEPS: String(MAX_LOOP_STEPS),
  OPACITY_STOP: glslFloat(OPACITY_STOP),
  DISK_FADE_IN: glslFloat(DISK_FADE_IN),
  DISK_FADE_OUT: glslFloat(DISK_FADE_OUT),
  T_PROFILE_PEAK: glslFloat(T_PROFILE_PEAK),
}
