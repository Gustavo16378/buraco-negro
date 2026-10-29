import { useStore } from '../state/store.ts'

/** Retícula fina no ponto da sonda. O canvas ocupa a tela toda, então as coordenadas são as da janela. */
export function ProbeMarker() {
  const point = useStore((s) => s.probe)
  if (!point) return null
  return (
    <svg
      className="pointer-events-none fixed size-7 -translate-x-1/2 -translate-y-1/2"
      style={{ left: point.x, top: point.y }}
      viewBox="0 0 28 28"
      aria-hidden="true"
    >
      <circle cx={14} cy={14} r={6} fill="none" stroke="#FFB46B" strokeWidth={1} />
      <path d="M14 1v7M14 20v7M1 14h7M20 14h7" stroke="#FFB46B" strokeWidth={1} />
    </svg>
  )
}
