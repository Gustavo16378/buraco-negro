import { useT } from '../i18n/index.ts'
import { useStore, type Mode } from '../state/store.ts'

const MODES: Mode[] = ['interstellar', 'real']

export function ModeToggle() {
  const t = useT()
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)

  return (
    <div
      role="group"
      aria-label={t.mode.label}
      className="fixed bottom-6 left-1/2 flex w-max -translate-x-1/2 border border-line bg-black/60 backdrop-blur-sm"
    >
      {MODES.map((m) => {
        const active = mode === m
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => setMode(m)}
            className={`px-4 py-2 text-sm transition-colors ${
              active ? 'bg-white/10 text-accent' : 'text-ink/60 hover:text-ink'
            }`}
          >
            {t.mode[m]}
          </button>
        )
      })}
    </div>
  )
}
