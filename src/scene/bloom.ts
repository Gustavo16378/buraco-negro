import {
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { setPaintTarget, type BlackHoleUniforms } from './blackHoleUniforms.ts'
import { BLOOM } from './bloomSettings.ts'
import { compileFor } from './compile.ts'
import { bloomDownShader, bloomSourceShader, bloomUpShader, createBlackHoleMaterial, vertexShader } from './shaderSource.ts'

const level = () =>
  new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
  })

const quadScene = (material: ShaderMaterial) => {
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  return { quad, scene }
}

/**
 * Bloom do renderizador com cache. O do postprocessing (que o direto ainda
 * usa) mede o brilho na resolução da tela e faz 8 reduções e 7 ampliações:
 * no celular eram ~20 ms por quadro, e ele espalhava as estrelas fortes em
 * bolas. Aqui:
 *   - a fonte é só a luz do disco (bloomSource.frag.glsl), calculada da
 *     cache numa fração da tela (`scale` por eixo);
 *   - poucos níveis (`levels`), com os mesmos filtros e o mesmo raio do
 *     postprocessing. Com raio 0,4, cada nível pesa 40% do anterior no
 *     resultado, então os que ficaram de fora somavam menos de 3%;
 *   - a soma na imagem e o tone mapping ficam na própria pintura, na passada
 *     que desenha na tela (paint.frag.glsl).
 * Aproximação: a fonte começa numa fração da tela, então o brilho mais
 * apertado em volta dos pontos fortes (o 1º nível do postprocessing) sai
 * mais espalhado.
 */
export function createBloom(uniforms: BlackHoleUniforms, scale: number, levels: number) {
  const source = quadScene(createBlackHoleMaterial(bloomSourceShader, uniforms))
  source.quad.onBeforeRender = (renderer) => setPaintTarget(uniforms, renderer)
  const common = { glslVersion: GLSL3, vertexShader, depthTest: false, depthWrite: false }
  const down = new ShaderMaterial({
    ...common,
    fragmentShader: bloomDownShader,
    uniforms: { uInput: { value: null as Texture | null }, uTexel: { value: new Vector2() } },
  })
  const up = new ShaderMaterial({
    ...common,
    fragmentShader: bloomUpShader,
    uniforms: {
      uInput: { value: null as Texture | null },
      uSupport: { value: null as Texture | null },
      uTexel: { value: new Vector2() },
      uRadius: { value: BLOOM.radius },
    },
  })
  const blur = quadScene(down)

  // first: a fonte; downs[i]: cada redução; ups[i]: cada ampliação, do
  // tamanho de downs[i - 1] (ou da fonte, ups[0], que é o resultado).
  const first = level()
  const downs = Array.from({ length: levels }, level)
  const ups = Array.from({ length: levels }, level)
  let width = 0
  let height = 0

  const resize = (w: number, h: number) => {
    width = w
    height = h
    let lw = Math.max(1, Math.round(w * scale))
    let lh = Math.max(1, Math.round(h * scale))
    first.setSize(lw, lh)
    ups[0].setSize(lw, lh)
    for (let i = 0; i < levels; i++) {
      lw = Math.max(1, Math.round(lw / 2))
      lh = Math.max(1, Math.round(lh / 2))
      downs[i].setSize(lw, lh)
      if (i + 1 < levels) ups[i + 1].setSize(lw, lh)
    }
  }

  const draw = (renderer: WebGLRenderer, camera: Camera, material: ShaderMaterial, input: WebGLRenderTarget, out: WebGLRenderTarget) => {
    blur.quad.material = material
    material.uniforms.uInput.value = input.texture
    material.uniforms.uTexel.value.set(1 / input.width, 1 / input.height)
    renderer.setRenderTarget(out)
    renderer.render(blur.scene, camera)
  }

  return {
    /** Compila os shaders sem travar a página (veja compile.ts). */
    compile: (renderer: WebGLRenderer, camera: Camera) =>
      Promise.all([
        compileFor(renderer, first, source.scene, camera, source.scene),
        compileFor(renderer, first, blur.scene, camera, blur.scene),
      ]),
    /**
     * Calcula o bloom da cache ligada agora, para uma tela de w × h, e
     * devolve a textura (do tamanho da fonte) para a pintura somar.
     */
    render(renderer: WebGLRenderer, camera: Camera, w: number, h: number) {
      if (w !== width || h !== height) resize(w, h)
      const previous = renderer.getRenderTarget()
      renderer.setRenderTarget(first)
      renderer.render(source.scene, camera)
      let input = first
      for (let i = 0; i < levels; i++) {
        draw(renderer, camera, down, input, downs[i])
        input = downs[i]
      }
      for (let i = levels - 1; i >= 0; i--) {
        up.uniforms.uSupport.value = (i === 0 ? first : downs[i - 1]).texture
        draw(renderer, camera, up, input, ups[i])
        input = ups[i]
      }
      renderer.setRenderTarget(previous)
      return ups[0].texture
    },
    dispose() {
      for (const t of [first, ...downs, ...ups]) t.dispose()
      source.quad.geometry.dispose()
      ;(source.quad.material as ShaderMaterial).dispose()
      blur.quad.geometry.dispose()
      down.dispose()
      up.dispose()
    },
  }
}

export type Bloom = ReturnType<typeof createBloom>
