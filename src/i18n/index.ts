import { useStore } from '../state/store.ts'
import { en } from './en.ts'
import { pt } from './pt.ts'

export const dictionaries = { pt, en }

/** Textos da interface no idioma atual. */
export function useT() {
  return dictionaries[useStore((s) => s.lang)]
}
