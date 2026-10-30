import { useEffect, useState } from 'react'
import { useT } from '../i18n/index.ts'
import { useStore } from '../state/store.ts'

// Depois disso sem a primeira imagem, a tela avisa que está demorando.
const SLOW_AFTER = 20000 // ms

/**
 * Tela de carregamento, por cima de tudo até a primeira imagem do buraco
 * negro ficar pronta (shaders compilados). Continua a que o index.html mostra
 * antes do JavaScript, com as mesmas classes (estilo no próprio index.html).
 * Se algo impedir a imagem (sem WebGL2, GPU parada, shader que não compila),
 * ela fica e mostra o motivo, em vez de a página ficar preta.
 */
export function Loading() {
  const t = useT()
  const ready = useStore((s) => s.ready)
  const failure = useStore((s) => s.failure)
  const [gone, setGone] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER)
    return () => clearTimeout(timer)
  }, [])

  // Uma falha depois da primeira imagem (a GPU parar no meio) traz a tela de volta.
  if (gone && !failure) return null
  const hidden = ready && !failure

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!ready && !failure}
      className={`boot transition-opacity duration-500 ${hidden ? 'pointer-events-none opacity-0' : ''}`}
      onTransitionEnd={() => hidden && setGone(true)}
    >
      {failure ? (
        <div className="max-w-sm">
          <p className="text-sm">{t.loading.failTitle}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink/70">{t.loading.failNote}</p>
          <p className="mt-3 font-mono text-[11px] leading-relaxed break-words text-ink/50">{failure}</p>
        </div>
      ) : (
        <>
          <div className="boot-bar" />
          <div className="max-w-xs">
            <p className="text-sm">{t.loading.title}</p>
            <p className="boot-text mt-2 text-xs leading-relaxed text-ink/60">{t.loading.note}</p>
            {slow && <p className="mt-2 text-xs leading-relaxed text-ink/60">{t.loading.slow}</p>}
          </div>
        </>
      )}
    </div>
  )
}
