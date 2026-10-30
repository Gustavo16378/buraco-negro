// Amortecimento da câmera medido em segundos, e não em quadros.
// O OrbitControls aplica, a cada update, a fração dampingFactor do giro que
// ainda falta e guarda o resto. Com um fator fixo, o escorregão depois de
// soltar o dedo dura um número fixo de quadros: a 30 fps, o dobro do tempo
// que a 60 fps. Aqui o fator de cada quadro sai do intervalo dt, para o resto
// cair sempre no mesmo ritmo por segundo. O giro total continua o do dedo
// (a soma das frações aplicadas é sempre o giro inteiro).

/** Fração do giro aplicada por quadro a 60 fps: a de antes, com a sensação já aprovada. */
export const DAMPING_AT_60 = 0.06

/** Ritmo de queda do giro que falta, por segundo: o resto cai como e^(-DAMPING_RATE · t). */
export const DAMPING_RATE = -60 * Math.log(1 - DAMPING_AT_60) // ≈ 3,71 por segundo

/** Fração do giro que falta a aplicar num quadro de dt segundos. */
export function dampingFactor(dt: number) {
  return 1 - Math.exp(-DAMPING_RATE * Math.max(0, dt))
}

/**
 * Quanto a câmera ainda vai andar, em pixels, se agora anda `speed` pixels
 * por segundo: a integral de speed · e^(-DAMPING_RATE · t).
 */
export function remainingGlide(speed: number) {
  return speed / DAMPING_RATE
}
