import { MathUtils, type PerspectiveCamera } from 'three'
import { shadowAngle } from '../physics.ts'
import type { ShadowMeasure } from '../state/store.ts'

// Linhas e colunas lidas em volta do centro. Cada uma dá uma estimativa do
// raio; a média reduz o erro de arredondamento para pixel inteiro.
const BAND = 31
const HALF = BAND >> 1

let rows = new Uint8Array(0)
let cols = new Uint8Array(0)

// Meia corda da sombra numa linha de n pixels (alfa 0 = sombra), medida a
// partir do pixel do meio. Devolve null se a linha não cruza a sombra ou se a
// sombra encosta na borda da tela (corda cortada).
function halfChord(buf: Uint8Array, n: number, index: (k: number) => number) {
  const mid = n >> 1
  const inShadow = (k: number) => buf[index(k) + 3] < 128
  if (!inShadow(mid)) return null
  let a = mid
  let b = mid
  while (a > 0 && inShadow(a - 1)) a--
  while (b < n - 1 && inShadow(b + 1)) b++
  if (a === 0 || b === n - 1) return null
  return (b - a + 1) / 2
}

/**
 * Mede o raio da sombra no framebuffer que acabou de ser desenhado. No modo de
 * depuração o shader marca com alfa 0 os raios que caíram no horizonte. A
 * câmera sempre olha para o centro do buraco, então a sombra é um círculo
 * centrado na tela: cada linha a uma distância y do centro corta uma corda de
 * meia largura c, e o raio é sqrt(c² + y²).
 */
export function measureShadow(
  gl: WebGL2RenderingContext,
  camera: PerspectiveCamera,
  cssHeight: number,
): ShadowMeasure | null {
  const w = gl.drawingBufferWidth
  const h = gl.drawingBufferHeight
  if (rows.length !== w * BAND * 4) rows = new Uint8Array(w * BAND * 4)
  if (cols.length !== h * BAND * 4) cols = new Uint8Array(h * BAND * 4)
  const row0 = (h >> 1) - HALF
  const col0 = (w >> 1) - HALF
  gl.readPixels(0, row0, w, BAND, gl.RGBA, gl.UNSIGNED_BYTE, rows)
  gl.readPixels(col0, 0, BAND, h, gl.RGBA, gl.UNSIGNED_BYTE, cols)

  let sum = 0
  let count = 0
  for (let j = 0; j < BAND; j++) {
    // Distância do centro do pixel até o centro da tela, em pixels.
    const rowOffset = row0 + j + 0.5 - h / 2
    const cRow = halfChord(rows, w, (k) => (j * w + k) * 4)
    if (cRow !== null) {
      sum += Math.hypot(cRow, rowOffset)
      count++
    }
    const colOffset = col0 + j + 0.5 - w / 2
    const cCol = halfChord(cols, h, (k) => (k * BAND + j) * 4)
    if (cCol !== null) {
      sum += Math.hypot(cCol, colOffset)
      count++
    }
  }
  if (count === 0) return null

  // Um pixel na tela corresponde a tan(fov/2) / (altura/2) na tangente do ângulo.
  const tanHalfFov = Math.tan(MathUtils.degToRad(camera.fov) / 2)
  const measured = Math.atan((sum / count / (h / 2)) * tanHalfFov)
  const camDist = camera.position.length()
  const expected = shadowAngle(camDist)

  return {
    camDist,
    measuredDeg: MathUtils.radToDeg(measured),
    expectedDeg: MathUtils.radToDeg(expected),
    expectedRadiusCss: (Math.tan(expected) / tanHalfFov) * (cssHeight / 2),
  }
}
