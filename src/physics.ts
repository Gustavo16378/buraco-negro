// Valores de referência em unidades geométricas, com r_s = 1 (SPEC, seção Física).

/** Parâmetro de impacto crítico: raios com b menor que isso caem no buraco. */
export const B_C = (3 * Math.sqrt(3)) / 2

/**
 * Raio angular da sombra, em radianos, para um observador parado à distância r:
 * sen(α) = (b_c / r) · sqrt(1 - 1/r).
 */
export function shadowAngle(r: number) {
  return Math.asin((B_C / r) * Math.sqrt(1 - 1 / r))
}
