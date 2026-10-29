import type { ReactNode } from 'react'
import { DEBUG } from '../debug.ts'
import { useT } from '../i18n/index.ts'
import { B_C } from '../physics/constants.ts'
import { useStore } from '../state/store.ts'
import { RayDiagram } from './RayDiagram.tsx'

// Tolerância da comparação com o shader (SPEC 3.2): r e g com diferença < 0,5%.
const GPU_TOLERANCE = 0.5

// Uma linha do painel: rótulo e valor lado a lado e, se houver, uma nota em
// largura total embaixo (assim notas longas não espremem o rótulo).
function Row({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <>
      <dt className="text-ink/70">{label}</dt>
      <dd className="text-right whitespace-nowrap">{children}</dd>
      {note && <dd className="col-span-2 mb-1 text-[11px] text-ink/60">{note}</dd>}
    </>
  )
}

/** Painel da sonda de raio (SPEC 3.2): lateral no desktop, folha inferior no celular. */
export function ProbePanel() {
  const t = useT()
  const p = t.probe
  const point = useStore((s) => s.probe)
  const reading = useStore((s) => s.probeReading)
  const gpu = useStore((s) => s.probeGpu)
  const mode = useStore((s) => s.mode)
  const setProbe = useStore((s) => s.setProbe)
  if (!point || !reading) return null

  const fixed = (digits: number) =>
    new Intl.NumberFormat(t.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const f0 = fixed(0)
  const f2 = fixed(2)
  const f3 = fixed(3)

  const first = reading.crossings[0]
  const others = reading.crossings.slice(1)
  const covered = reading.destination !== 'disk' && reading.opacity >= 0.005 ? p.covered(f0.format(reading.opacity * 100)) : null

  // Valor que o shader calculou, ao lado do da CPU, com a diferença (só no ?debug).
  const versus = (cpu: number, gpuValue: number | undefined, digits: number) => {
    if (!DEBUG || gpuValue === undefined) return null
    const diff = (gpuValue / cpu - 1) * 100
    const ok = Math.abs(diff) < GPU_TOLERANCE
    return (
      <span className={ok ? undefined : 'text-accent'} data-cpu={cpu} data-gpu={gpuValue}>
        {p.gpu} {fixed(digits).format(gpuValue)} · Δ {f2.format(diff)}%
      </span>
    )
  }

  return (
    <aside
      aria-label={p.title}
      className="fixed inset-x-0 bottom-0 z-10 max-h-[40vh] overflow-y-auto border-t border-line bg-black/85 p-4 text-sm text-ink backdrop-blur-sm md:inset-x-auto md:top-16 md:right-4 md:bottom-auto md:max-h-[calc(100vh-6rem)] md:w-80 md:border"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">{p.title}</h2>
        <button
          type="button"
          onClick={() => setProbe(null)}
          aria-label={p.close}
          className="-m-2 p-2 text-ink/60 transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth={1.25} />
          </svg>
        </button>
      </header>

      <RayDiagram diagram={reading.diagram} />

      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-xs">
        <Row
          label={p.destination}
          note={
            (covered || (DEBUG && gpu)) && (
              <>
                {covered && <span className="block">{covered}</span>}
                {DEBUG && gpu && (
                  <span
                    className={`block ${gpu.destination === reading.destination ? '' : 'text-accent'}`}
                    data-gpu-destination={gpu.destination}
                  >
                    {p.gpu} {p.destinations[gpu.destination]}
                  </span>
                )}
              </>
            )
          }
        >
          <span data-destination={reading.destination}>{p.destinations[reading.destination]}</span>
        </Row>
        <Row label={p.impact} note={`b_c = ${f3.format(B_C)} · ${reading.b < B_C ? p.impactBelow : p.impactAbove}`}>
          {f3.format(reading.b)} r_s
        </Row>
        <Row label={p.minDistance}>
          {reading.minDistance === null ? p.crossedHorizon : `${f3.format(reading.minDistance)} r_s`}
        </Row>
        <Row label={p.deflection}>
          {reading.deflection === null ? p.notApplicable : `${f2.format(reading.deflection)}°`}
        </Row>
        <Row label={p.crossings}>{reading.crossings.length}</Row>
      </dl>

      {first && (
        <section className="mt-4 border-t border-line pt-3">
          <h3 className="mb-1 text-xs font-medium text-accent">{p.diskTitle}</h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-xs">
            <Row label={p.radius} note={versus(first.r, gpu?.r, 3)}>
              {f3.format(first.r)} r_s
            </Row>
            <Row label={p.speed}>{f3.format(reading.firstSpeed ?? 0)} c</Row>
            <Row label={p.gPhysical}>{f3.format(first.gPhysical)}</Row>
            <Row label={p.gApplied} note={versus(first.gApplied, gpu?.g, 3)}>
              {f3.format(first.gApplied)}
            </Row>
            <Row label={p.tEmitted}>{f0.format(first.tEmitted)} K</Row>
            <Row label={p.tObserved}>{f0.format(first.tObserved)} K</Row>
            <Row label={p.brightness}>× {f2.format(first.gApplied ** 4)}</Row>
          </dl>
          {mode === 'interstellar' && <p className="mt-2 text-[11px] text-ink/60">{p.gInterstellar}</p>}
          {others.length > 0 && (
            <>
              <h4 className="mt-3 mb-1 text-xs text-ink/70">{p.others}</h4>
              <ul className="font-mono text-xs">
                {others.map((c, i) => (
                  <li key={i} className="flex justify-between">
                    <span>r = {f3.format(c.r)} r_s</span>
                    <span className="text-ink/60">
                      {p.opacity} {f2.format(c.alpha)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {reading.sensitive && <p className="mt-3 text-xs text-accent">{p.sensitive}</p>}
    </aside>
  )
}
