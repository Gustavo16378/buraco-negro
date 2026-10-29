import { useStore, type Mode } from '../state/store.ts'

const OPTIONS: { mode: Mode; label: string }[] = [
  { mode: 'interstellar', label: 'Interstellar' },
  { mode: 'real', label: 'Física real' },
]

export function ModeToggle() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)

  return (
    <div
      role="group"
      aria-label="Modo de visualização"
      className="fixed bottom-6 left-1/2 flex w-max -translate-x-1/2 border border-line bg-black/60 backdrop-blur-sm"
    >
      {OPTIONS.map((o) => {
        const active = mode === o.mode
        return (
          <button
            key={o.mode}
            type="button"
            aria-pressed={active}
            onClick={() => setMode(o.mode)}
            className={`px-4 py-2 text-sm transition-colors ${
              active ? 'bg-white/10 text-accent' : 'text-ink/60 hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
