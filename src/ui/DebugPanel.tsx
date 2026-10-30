import type { ReactNode } from 'react'
import { useT } from '../i18n/index.ts'
import { useStore, type PrecisionFormat } from '../state/store.ts'

// Critério de aceite do SPEC: raio medido a menos de 2% do esperado.
const TOLERANCE = 2
// Autoteste do céu: diferença relativa aceita entre GPU e CPU. Em 16 bits a
// própria leitura arredonda ~0,05%, então a folga é maior.
const SELF_TEST_TOLERANCE = { float32: 1e-4, float16: 2e-3 }

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <p className="mt-2 text-accent first:mt-0">{title}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-4">{children}</dl>
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="text-right">{children}</dd>
    </>
  )
}

export function DebugPanel() {
  const t = useT()
  const d = t.debug
  const shadow = useStore((s) => s.shadow)
  const quality = useStore((s) => s.quality)
  const fps = useStore((s) => s.fps)
  const device = useStore((s) => s.device)
  const render = useStore((s) => s.render)

  const num = new Intl.NumberFormat(t.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const int = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 0 })
  const fine = new Intl.NumberFormat(t.locale, { minimumFractionDigits: 5, maximumFractionDigits: 5 })
  const ms = new Intl.NumberFormat(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  const diff = shadow ? (shadow.measuredDeg / shadow.expectedDeg - 1) * 100 : 0
  const ok = Math.abs(diff) < TOLERANCE

  const format = (f: PrecisionFormat) => (f.precision > 0 || f.rangeMax > 0 ? d.bits(f.precision, f.rangeMax) : d.none)
  const tolerance = SELF_TEST_TOLERANCE[device?.readback ?? 'float32']
  const compare = ([gpu, cpu]: [number, number]) => {
    const same = Math.abs(gpu - cpu) <= tolerance * Math.max(Math.abs(cpu), 1e-6)
    return (
      <span className={same ? undefined : 'text-accent'}>
        {fine.format(gpu)} · {same ? d.same : d.different}
      </span>
    )
  }

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
      <div className="pointer-events-none fixed top-4 left-4 max-w-[calc(100vw-7rem)] border border-line bg-black/75 px-3 py-2 font-mono text-[11px] leading-[1.35rem] text-ink">
        <Section title={d.title}>
          <Row label={d.fps}>{int.format(fps)}</Row>
          <Row label={d.dpr}>{num.format(quality.dpr)}</Row>
          <Row label={d.steps}>{quality.steps}</Row>
          {render && (
            <>
              <Row label={d.render}>
                {render.width}×{render.height}
              </Row>
              <dd className="col-span-2 text-right text-ink/60">
                {d.ofScreen(int.format((render.width / render.physicalWidth) * 100))}
              </dd>
              <Row label={d.deviceDpr}>{num.format(render.devicePixelRatio)}</Row>
              <Row label={d.renderer}>{render.renderer === 'legacy' ? d.rendererLegacy : d.rendererCached}</Row>
              <Row label={d.trace}>
                {render.traceWidth}×{render.traceHeight}
              </Row>
              <Row label={d.tracesPerSecond}>{int.format(render.tracesPerSecond)}</Row>
              {render.phase && (
                <>
                  <Row label={d.phase}>
                    {render.phase === 'motion'
                      ? d.phaseMotion
                      : render.phase === 'refining'
                        ? d.phaseRefining(int.format(render.refine * 100))
                        : d.phaseStill}
                  </Row>
                  <Row label={d.motionDiv}>{num.format(quality.motionDiv)}</Row>
                </>
              )}
            </>
          )}
        </Section>

        {render?.times && (
          <Section title={d.timing}>
            <dd className="col-span-2 text-ink/60">{d.timingNote}</dd>
            <Row label={d.partOther}>{ms.format(render.times.other)} ms</Row>
            {render.renderer === 'cached' && (
              <>
                <Row label={d.partGas}>{ms.format(render.times.gas)} ms</Row>
                <Row label={d.partTrace}>{ms.format(render.times.trace)} ms</Row>
                <Row label={d.partLow}>{ms.format(render.times.low)} ms</Row>
              </>
            )}
            <Row label={render.renderer === 'cached' ? d.partPost : d.partPostLegacy}>{ms.format(render.times.post)} ms</Row>
            <Row label={d.partTotal}>{ms.format(render.times.total)} ms</Row>
          </Section>
        )}

        {device && (
          <Section title={d.device}>
            <dd className="col-span-2 break-all text-ink/80">{device.gpu}</dd>
            <Row label={d.highp}>{format(device.highFloat)}</Row>
            <Row label={d.mediump}>{format(device.mediumFloat)}</Row>
            <Row label={d.highInt}>{device.highInt.rangeMax > 0 ? d.intRange(device.highInt.rangeMax) : d.none}</Row>
            <Row label={d.shaderPrecision}>{device.shaderPrecision}</Row>
            <Row label={d.maxTexture}>{device.maxTextureSize}</Row>
            <Row label={d.readback}>{device.readback ?? d.unavailable}</Row>
          </Section>
        )}

        {device && (
          <Section title={d.selfTest}>
            {device.selfTest ? (
              <>
                <Row label={d.hash}>{compare(device.selfTest.hash)}</Row>
                <Row label={d.noise}>{compare(device.selfTest.noise)}</Row>
                <Row label={d.fbm}>{compare(device.selfTest.fbm)}</Row>
                <Row label={d.milkyWay}>
                  <span className={device.selfTest.milkyWay > 0.001 ? undefined : 'text-accent'}>
                    {fine.format(device.selfTest.milkyWay)}
                  </span>
                </Row>
                {device.selfTest.milkyWay <= 0.001 && <dd className="col-span-2 text-accent">{d.milkyWayZero}</dd>}
              </>
            ) : (
              <dd className="col-span-2">{d.unavailable}</dd>
            )}
          </Section>
        )}

        {shadow && (
          <Section title={d.shadow}>
            <Row label={d.distance}>{num.format(shadow.camDist)} r_s</Row>
            <Row label={d.shadowMeasured}>{num.format(shadow.measuredDeg)}°</Row>
            <Row label={d.shadowExpected}>{num.format(shadow.expectedDeg)}°</Row>
            <Row label={d.difference}>{num.format(diff)}%</Row>
            <dd className={`col-span-2 ${ok ? 'text-ink' : 'text-accent'}`}>{ok ? d.withinLimit : d.aboveLimit}</dd>
          </Section>
        )}
      </div>
    </>
  )
}
