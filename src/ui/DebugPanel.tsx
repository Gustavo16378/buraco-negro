import { useStore } from '../state/store.ts'

const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Critério de aceite do SPEC: raio medido a menos de 2% do esperado.
const TOLERANCE = 2

export function DebugPanel() {
  const shadow = useStore((s) => s.shadow)
  if (!shadow) return null

  const diff = (shadow.measuredDeg / shadow.expectedDeg - 1) * 100
  const ok = Math.abs(diff) < TOLERANCE

  return (
    <>
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
      <div className="pointer-events-none fixed top-4 left-4 border border-line bg-black/70 px-3 py-2 font-mono text-xs leading-5 text-ink">
        <p className="text-accent">debug: tamanho da sombra</p>
        <dl className="grid grid-cols-[auto_auto] gap-x-4">
          <dt>distância</dt>
          <dd className="text-right">{num.format(shadow.camDist)} r_s</dd>
          <dt>medido</dt>
          <dd className="text-right">{num.format(shadow.measuredDeg)}°</dd>
          <dt>esperado</dt>
          <dd className="text-right">{num.format(shadow.expectedDeg)}°</dd>
          <dt>diferença</dt>
          <dd className="text-right">{num.format(diff)}%</dd>
        </dl>
        <p className={ok ? 'text-ink' : 'text-accent'}>{ok ? 'dentro do limite de 2%' : 'acima do limite de 2%'}</p>
      </div>
    </>
  )
}
