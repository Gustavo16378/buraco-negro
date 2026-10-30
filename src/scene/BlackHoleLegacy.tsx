import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { HalfFloatType, WebGLRenderTarget, type Mesh } from 'three'
import { DEBUG } from '../debug.ts'
import { pixelUv } from '../physics/probe.ts'
import type { Destination } from '../physics/trace.ts'
import { useStore } from '../state/store.ts'
import { copyTraceInputs, createBlackHoleUniforms, traceSnapshot, useAnimatedUniforms } from './blackHoleUniforms.ts'
import { compileFor } from './compile.ts'
import { createShaderPass } from './gpuReadback.ts'
import { createBlackHoleMaterial, legacyShader } from './shaderSource.ts'
import { attachShadowMeasure } from './shadowMeasure.ts'
import { sceneShared } from './shared.ts'

const DESTINATIONS: Destination[] = ['sky', 'horizon', 'disk']

/**
 * Renderizador direto (?legacy): um quad de tela cheia em que cada pixel
 * traça o raio e pinta o resultado, a cada quadro. É o renderizador até a
 * Etapa 5.1, mantido para comparar com o renderizador com cache.
 */
export function BlackHoleLegacy() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const mesh = useRef<Mesh>(null)
  const uniforms = useMemo(() => createBlackHoleUniforms(), [])
  const material = useMemo(() => createBlackHoleMaterial(legacyShader, uniforms), [uniforms])
  useAnimatedUniforms(uniforms)

  useFrame(({ camera }) => {
    // Passos por raio: o PerformanceMonitor (Quality.tsx) ajusta.
    copyTraceInputs(uniforms, camera, useStore.getState().quality.steps)
    sceneShared.traces++
  })

  // Sonda e autoteste: o traçado em exibição é o deste quadro, na resolução
  // da tela; a conferência da GPU refaz o pixel da sonda no modo uProbe = 1.
  useEffect(() => {
    const pass = DEBUG ? createShaderPass(gl) : null
    const detach = DEBUG && mesh.current ? attachShadowMeasure(mesh.current) : null

    // Compila sem travar a página, numa render target de ponto flutuante como
    // a do pós-processamento; até lá a tela de carregamento fica na frente.
    const m = mesh.current
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
    let alive = true
    if (m) {
      m.visible = false
      compileFor(gl, target, m, camera, scene).then(() => {
        target.dispose()
        if (!alive) return
        m.visible = true
        useStore.getState().setReady(true)
      })
    }
    sceneShared.renderer = 'legacy'
    sceneShared.selfTestMaterial = material
    sceneShared.probe = {
      snapshot: () => traceSnapshot(uniforms, gl.domElement.width, gl.domElement.height),
      readGpu: (px, py) => {
        if (!pass) return null
        const [ux, uy] = pixelUv(px, py, gl.domElement.width, gl.domElement.height)
        uniforms.uProbeUv.value.set(ux, uy)
        const [dest, r, g, opacity] = pass.run(material, camera, 1)
        return { destination: DESTINATIONS[Math.round(dest)] ?? 'sky', r, g, opacity }
      },
    }
    return () => {
      alive = false
      target.dispose()
      pass?.dispose()
      detach?.()
      material.dispose()
      sceneShared.renderer = null
      sceneShared.selfTestMaterial = null
      sceneShared.probe = null
    }
  }, [gl, camera, scene, uniforms, material])

  return (
    <mesh ref={mesh} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
