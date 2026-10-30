import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  HalfFloatType,
  MathUtils,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three'
import { DEBUG } from '../debug.ts'
import { OPACITY_STOP } from '../physics/constants.ts'
import { useStore } from '../state/store.ts'
import {
  bindCache,
  copyTraceInputs,
  createBlackHoleUniforms,
  setCacheScale,
  traceSnapshot,
  useAnimatedUniforms,
  type BlackHoleUniforms,
} from './blackHoleUniforms.ts'
import { createGasFields, type GasFields } from './gasFields.ts'
import { readTexel } from './gpuReadback.ts'
import { createBlackHoleMaterial, paintShader, traceShader } from './shaderSource.ts'
import { attachShadowMeasure } from './shadowMeasure.ts'
import { sceneShared } from './shared.ts'

// A imagem tem que andar mais que isso (em pixels da tela) desde o último
// traçado para valer traçar de novo. O amortecimento do OrbitControls deixa a
// câmera escorregando por frações de pixel por vários segundos depois que o
// dedo solta; sem esse limite, a cache seria refeita a cada quadro à toa.
const RETRACE_PX = 0.25

type TracePass = {
  material: ReturnType<typeof createBlackHoleMaterial>
  scene: Scene
  target: WebGLRenderTarget
  dispose: () => void
}

function createTracePass(uniforms: BlackHoleUniforms): TracePass {
  const material = createBlackHoleMaterial(traceShader, uniforms)
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  // Uma textura por saída do trace.frag.glsl (céu, 1º e 2º cruzamento), em
  // float16. A pintura lê com texelFetch, sem filtro nem mipmap.
  const target = new WebGLRenderTarget(1, 1, {
    count: 3,
    type: HalfFloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
  })
  return {
    material,
    scene,
    target,
    dispose: () => {
      target.dispose()
      material.dispose()
      quad.geometry.dispose()
    },
  }
}

/** Câmera, passos e resolução do traçado que está na cache. */
type Traced = {
  position: Vector3
  quaternion: Quaternion
  fov: number
  aspect: number
  steps: number
  width: number
  height: number
}

function needsTrace(last: Traced | null, camera: PerspectiveCamera, steps: number, size: Vector2) {
  if (!last) return true
  if (last.width !== size.x || last.height !== size.y || last.steps !== steps) return true
  if (last.fov !== camera.fov || last.aspect !== camera.aspect) return true
  // Quanto a imagem andou, em radianos: o giro da câmera mais o deslocamento
  // visto do centro (no zoom isso superestima, o que só adianta o traçado).
  const turn = last.quaternion.angleTo(camera.quaternion)
  const shift = last.position.distanceTo(camera.position) / Math.max(camera.position.length(), 1)
  const pixel = MathUtils.degToRad(camera.fov) / size.y
  return turn + shift > RETRACE_PX * pixel
}

/**
 * Renderizador com cache (SPEC 6). O espaço-tempo é estático: com a câmera
 * parada, o caminho de cada raio não muda. Então o traçado, que é a parte
 * cara, só roda quando a câmera anda e grava o resultado numa cache; a
 * pintura, a cada quadro, só desenha o gás girando e soma o céu já pronto.
 */
export function BlackHoleCached() {
  const gl = useThree((s) => s.gl)
  const paint = useRef<Mesh>(null)
  const trace = useRef<TracePass | null>(null)
  const gas = useRef<GasFields | null>(null)
  const traced = useRef<Traced | null>(null)
  const size = useMemo(() => new Vector2(), [])
  const uniforms = useMemo(() => createBlackHoleUniforms(), [])
  const material = useMemo(() => createBlackHoleMaterial(paintShader, uniforms), [uniforms])
  useAnimatedUniforms(uniforms)

  useEffect(() => {
    const pass = createTracePass(uniforms)
    trace.current = pass
    const fields = createGasFields(uniforms)
    gas.current = fields
    traced.current = null
    bindCache(uniforms, pass.target)

    // Sonda: o traçado em exibição é o da cache, na resolução dela, e a
    // conferência da GPU lê os valores que o traçado gravou para o pixel.
    sceneShared.renderer = 'cached'
    sceneShared.selfTestMaterial = pass.material
    sceneShared.probe = {
      snapshot: () => (traced.current ? traceSnapshot(uniforms, pass.target.width, pass.target.height) : null),
      readGpu: (px, py) => {
        const hit = readTexel(gl, pass.target, 1, px, py)
        const rest = readTexel(gl, pass.target, 2, px, py)
        if (!hit || !rest) return null
        const [r, , shift, captured] = hit
        const opacity = rest[3]
        return {
          destination: opacity > OPACITY_STOP ? 'disk' : captured > 0.5 ? 'horizon' : 'sky',
          r,
          g: r > 0 ? MathUtils.lerp(1, shift, uniforms.uRealismo.value) : 0,
          opacity,
        }
      },
    }

    const mesh = paint.current
    if (mesh) mesh.onBeforeRender = (renderer) => setCacheScale(uniforms, pass.target, renderer)
    const detach = DEBUG && mesh ? attachShadowMeasure(mesh) : null

    return () => {
      pass.dispose()
      fields.dispose()
      material.dispose()
      trace.current = null
      gas.current = null
      bindCache(uniforms, null)
      if (mesh) mesh.onBeforeRender = () => {}
      detach?.()
      sceneShared.renderer = null
      sceneShared.selfTestMaterial = null
      sceneShared.probe = null
    }
  }, [gl, uniforms, material])

  // Prioridade 0: depois do OrbitControls (-1), que move a câmera, e do
  // avanço do tempo (registrado antes), e antes da sonda (0,5) e do
  // pós-processamento (1), que desenha a tela.
  useFrame(({ camera }) => {
    gas.current?.update(gl, camera)
    const pass = trace.current
    if (!pass || !(camera instanceof PerspectiveCamera)) return
    gl.getDrawingBufferSize(size)
    const steps = useStore.getState().quality.steps
    if (!needsTrace(traced.current, camera, steps, size)) return

    const { target } = pass
    if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y)
    copyTraceInputs(uniforms, camera, steps)
    const previous = gl.getRenderTarget()
    gl.setRenderTarget(target)
    gl.render(pass.scene, camera)
    gl.setRenderTarget(previous)
    sceneShared.traces++

    traced.current = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      fov: camera.fov,
      aspect: camera.aspect,
      steps,
      width: size.x,
      height: size.y,
    }
  })

  return (
    <mesh ref={paint} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
