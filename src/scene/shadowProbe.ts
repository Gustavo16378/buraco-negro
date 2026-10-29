import { MathUtils, type PerspectiveCamera } from 'three'
import { shadowAngle } from '../physics/observables.ts'
import type { ShadowMeasure } from '../state/store.ts'

// Linhas e colunas lidas em volta do centro. Cada uma dá uma estimativa do
// raio; a média reduz o erro de arredondamento para pixel inteiro.
const BAND = 31
const HALF = BAND >> 1

/**
 * Framebuffer de onde ler: a tela (8 bits) ou uma render target em ponto
 * flutuante, lida em 32 bits (float) ou, se o aparelho não deixa, em 16 (half).
 */
export type PixelSource = { width: number; height: number; type: 'byte' | 'float' | 'half' }

type Pixels = Uint8Array<ArrayBuffer> | Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>

let rows: Pixels = new Uint8Array(0)
let cols: Pixels = new Uint8Array(0)

function buffer(current: Pixels, length: number, type: PixelSource['type']): Pixels {
  const Kind = type === 'float' ? Float32Array : type === 'half' ? Uint16Array : Uint8Array
  if (current.length === length && current instanceof Kind) return current
  return new Kind(length)
}

// Alfa abaixo da metade da escala = sombra. Em 16 bits, 0x3800 é 0,5 em half
// float; para alfas não negativos, comparar os bits já compara os valores.
const HALF_SCALE = { byte: 128, float: 0.5, half: 0x3800 }

// Meia corda da sombra numa linha de n pixels, medida a partir do pixel do
// meio. Devolve null se a linha não cruza a sombra ou se a sombra encosta na
// borda da tela (corda cortada).
function halfChord(n: number, inShadow: (k: number) => boolean) {
  const mid = n >> 1
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
  source: PixelSource,
  camera: PerspectiveCamera,
  cssHeight: number,
): ShadowMeasure | null {
  const { width: w, height: h } = source
  rows = buffer(rows, w * BAND * 4, source.type)
  cols = buffer(cols, h * BAND * 4, source.type)
  const type = source.type === 'float' ? gl.FLOAT : source.type === 'half' ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE
  const row0 = (h >> 1) - HALF
  const col0 = (w >> 1) - HALF
  // Limpa erros pendentes de outras partes, para o teste abaixo valer só para a leitura.
  for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++);
  gl.readPixels(0, row0, w, BAND, gl.RGBA, type, rows)
  gl.readPixels(col0, 0, BAND, h, gl.RGBA, type, cols)
  // Leitura recusada pelo aparelho: sem medida, em vez de uma medida errada.
  if (gl.getError() !== gl.NO_ERROR) return null

  const half = HALF_SCALE[source.type]

  let sum = 0
  let count = 0
  for (let j = 0; j < BAND; j++) {
    // Distância do centro do pixel até o centro da tela, em pixels.
    const rowOffset = row0 + j + 0.5 - h / 2
    const cRow = halfChord(w, (k) => rows[(j * w + k) * 4 + 3] < half)
    if (cRow !== null) {
      sum += Math.hypot(cRow, rowOffset)
      count++
    }
    const colOffset = col0 + j + 0.5 - w / 2
    const cCol = halfChord(h, (k) => cols[(k * BAND + j) * 4 + 3] < half)
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
