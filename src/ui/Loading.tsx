import { useState } from 'react'
import { useT } from '../i18n/index.ts'
import { useStore } from '../state/store.ts'

/**
 * Tela de carregamento, por cima de tudo até a primeira imagem do buraco
 * negro ficar pronta (shaders compilados). Continua a que o index.html mostra
 * antes do JavaScript, com as mesmas classes (estilo no próprio index.html).
 */
export function Loading() {
  const t = useT()
  const ready = useStore((s) => s.ready)
  const [gone, setGone] = useState(false)
  if (gone) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!ready}
      className={`boot transition-opacity duration-500 ${ready ? 'pointer-events-none opacity-0' : ''}`}
      onTransitionEnd={() => ready && setGone(true)}
    >
      <div className="boot-bar" />
      <div className="boot-text max-w-xs">
        <p className="text-sm">{t.loading.title}</p>
        <p className="mt-2 text-xs leading-relaxed text-ink/60">{t.loading.note}</p>
      </div>
    </div>
  )
}
