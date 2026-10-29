import { useT } from '../i18n/index.ts'
import { useStore, type Lang } from '../state/store.ts'

const OPTIONS: { lang: Lang; short: string; htmlLang: string }[] = [
  { lang: 'pt', short: 'PT', htmlLang: 'pt-BR' },
  { lang: 'en', short: 'EN', htmlLang: 'en' },
]

export function LangToggle() {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)

  return (
    <div
      role="group"
      aria-label={t.language.label}
      className="fixed top-4 right-4 flex w-max border border-line bg-black/60 font-mono text-xs backdrop-blur-sm"
    >
      {OPTIONS.map((o) => {
        const active = lang === o.lang
        return (
          <button
            key={o.lang}
            type="button"
            lang={o.htmlLang}
            title={t.language[o.lang]}
            aria-pressed={active}
            onClick={() => setLang(o.lang)}
            className={`px-3 py-2 transition-colors ${active ? 'bg-white/10 text-accent' : 'text-ink/60 hover:text-ink'}`}
          >
            {o.short}
          </button>
        )
      })}
    </div>
  )
}
