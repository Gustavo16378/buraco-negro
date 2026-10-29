import { useStore } from '../state/store.ts'

const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

// Critério de aceite do SPEC: raio medido a menos de 2% do esperado.
const TOLERANCE = 2

export function DebugPanel() {
  const shadow = useStore((s) => s.shadow)
  const quality = useStore((s) => s.quality)
  const fps = useStore((s) => s.fps)

  const diff = shadow ? (shadow.measuredDeg / shadow.expectedDeg - 1) * 100 : 0
  const ok = Math.abs(diff) < TOLERANCE

  return (
    <>
      {shadow && (
        <svg className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden="true">
          <circle
            cx="50%"
            cy="50%"
            r={shadow.expectedRadiusCss}
            fill="none"
            stroke="#FFB46B"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        </svg>
      )}
      <div className="pointer-events-none fixed top-4 left-4 border border-line bg-black/70 px-3 py-2 font-mono text-xs leading-5 text-ink">
        <p className="text-accent">debug</p>
        <dl className="grid grid-cols-[auto_auto] gap-x-4">
          <dt>fps</dt>
          <dd className="text-right">{int.format(fps)}</dd>
          <dt>dpr</dt>
          <dd className="text-right">{num.format(quality.dpr)}</dd>
          <dt>passos</dt>
          <dd className="text-right">{quality.steps}</dd>
          {shadow && (
            <>
              <dt>distância</dt>
              <dd className="text-right">{num.format(shadow.camDist)} r_s</dd>
              <dt>sombra medida</dt>
              <dd className="text-right">{num.format(shadow.measuredDeg)}°</dd>
              <dt>sombra esperada</dt>
              <dd className="text-right">{num.format(shadow.expectedDeg)}°</dd>
              <dt>diferença</dt>
              <dd className="text-right">{num.format(diff)}%</dd>
            </>
          )}
        </dl>
        {shadow && (
          <p className={ok ? 'text-ink' : 'text-accent'}>{ok ? 'dentro do limite de 2%' : 'acima do limite de 2%'}</p>
        )}
      </div>
    </>
  )
}
