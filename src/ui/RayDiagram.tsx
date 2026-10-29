import { useT } from '../i18n/index.ts'
import type { Diagram, Point2 } from '../physics/probe.ts'

const SIZE = 240
const HALF = SIZE / 2
const MARGIN = 12
const INK = '#E8E6E1'
const ACCENT = '#FFB46B'

// Comprimentos possíveis da barra de escala, em r_s.
const SCALE_STEPS = [1, 2, 5, 10, 20, 50]

/** Diagrama 2D do raio da sonda, no plano da órbita (SPEC 3.2). A câmera fica à esquerda. */
export function RayDiagram({ diagram }: { diagram: Diagram }) {
  const t = useT()

  // Enquadra o que importa (câmera, disco e horizonte), não o caminho inteiro:
  // um raio que escapa vai até r = 60 e deixaria o buraco minúsculo.
  const frame: Point2[] = [diagram.camera, [1, 1], [-1, -1]]
  if (diagram.disk) for (const [, outer] of diagram.disk) frame.push(outer)
  else frame.push([diagram.diskOut, diagram.diskOut], [-diagram.diskOut, -diagram.diskOut])
  const xs = frame.map((p) => p[0])
  const ys = frame.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const k = (SIZE - 2 * MARGIN) / (span * 1.08) // pixels por r_s
  const X = (p: Point2) => HALF - (p[0] - cx) * k
  const Y = (p: Point2) => HALF - (p[1] - cy) * k
  const center: Point2 = [0, 0]
  const polyline = (pts: Point2[]) => pts.map((p) => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join(' ')
  const bar = SCALE_STEPS.find((s) => s * k >= 36) ?? SCALE_STEPS[SCALE_STEPS.length - 1]

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto block w-full max-w-60 border border-line"
        role="img"
        aria-label={t.probe.diagram}
      >
        {diagram.disk ? (
          diagram.disk.map(([a, b], i) => (
            <line key={i} x1={X(a)} y1={Y(a)} x2={X(b)} y2={Y(b)} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          ))
        ) : (
          // O plano da órbita é o próprio plano do disco: o disco aparece inteiro, como um anel.
          <circle
            cx={X(center)}
            cy={Y(center)}
            r={((diagram.diskIn + diagram.diskOut) / 2) * k}
            fill="none"
            stroke={ACCENT}
            strokeOpacity={0.35}
            strokeWidth={(diagram.diskOut - diagram.diskIn) * k}
          />
        )}
        <circle cx={X(center)} cy={Y(center)} r={1.5 * k} fill="none" stroke={INK} strokeOpacity={0.5} strokeDasharray="3 3" />
        <circle cx={X(center)} cy={Y(center)} r={k} fill="#000" stroke={INK} strokeWidth={1} />
        {diagram.after.length > 1 && (
          <polyline
            points={polyline(diagram.after)}
            fill="none"
            stroke={INK}
            strokeOpacity={0.3}
            strokeDasharray="4 3"
          />
        )}
        <polyline points={polyline(diagram.path)} fill="none" stroke={INK} strokeWidth={1.25} strokeLinejoin="round" />
        {diagram.crossings.map((c, i) => (
          <circle key={i} cx={X(c)} cy={Y(c)} r={3} fill={ACCENT} stroke="#000" strokeWidth={1} />
        ))}
        <circle cx={X(diagram.camera)} cy={Y(diagram.camera)} r={3.5} fill={INK} />
        <line x1={MARGIN} y1={SIZE - MARGIN} x2={MARGIN + bar * k} y2={SIZE - MARGIN} stroke={INK} strokeOpacity={0.7} />
        <text x={MARGIN} y={SIZE - MARGIN - 5} fill={INK} fillOpacity={0.7} fontSize={10} fontFamily="JetBrains Mono, monospace">
          {bar} r_s
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink/70">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-ink" aria-hidden="true" />
          {t.probe.legend.camera}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full border border-ink bg-black" aria-hidden="true" />
          {t.probe.legend.horizon}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full border border-dashed border-ink/60" aria-hidden="true" />
          {t.probe.legend.photonSphere}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-accent" aria-hidden="true" />
          {t.probe.legend.disk}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 border-t border-dashed border-ink/40" aria-hidden="true" />
          {t.probe.legend.afterStop}
        </span>
      </figcaption>
    </figure>
  )
}
