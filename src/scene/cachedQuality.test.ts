// Testes do ajuste de qualidade do renderizador com cache. Rodar com `npm test`.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_DPR,
  MAX_STEPS,
  MIN_REFINE_ROWS,
  MIN_STEPS,
  createCachedQuality,
  initialLevels,
  lowerMotion,
  maxDprFor,
  nextRefineRows,
  raiseMotion,
  type Levels,
} from './cachedQuality.ts'

test('ponto de partida: celular a 75% da tela física, desktop no dpr da tela', () => {
  assert.deepEqual(initialLevels(true, 2), { dpr: 1.5, steps: 160, motionDiv: 3 })
  assert.equal(initialLevels(true, 3).dpr, 2)
  assert.equal(initialLevels(true, 1).dpr, 0.75)
  assert.equal(initialLevels(false, 1).dpr, 1)
  assert.equal(initialLevels(false, 3).dpr, MAX_DPR)
  assert.equal(initialLevels(false, 1).steps, MAX_STEPS)
})

test('movimento: desce a resolução antes dos passos e sobe na ordem inversa', () => {
  let q: Levels = { dpr: 1, steps: MAX_STEPS, motionDiv: 1 }
  const down: Levels[] = []
  for (let i = 0; i < 12; i++) down.push((q = lowerMotion(q)))
  assert.deepEqual(down.slice(0, 4).map((x) => x.motionDiv), [1.5, 2, 3, 4])
  assert.ok(down.slice(0, 4).every((x) => x.steps === MAX_STEPS))
  assert.equal(q.steps, MIN_STEPS)
  assert.equal(q.motionDiv, 4)
  for (let i = 0; i < 12; i++) q = raiseMotion(q)
  assert.deepEqual(q, { dpr: 1, steps: MAX_STEPS, motionDiv: 1 })
})

// Alimenta o controle com quadros de um tipo a um fps fixo e devolve a primeira troca.
function feed(c: ReturnType<typeof createCachedQuality>, kind: 'motion' | 'idle', fps: number, q: Levels) {
  for (let i = 0; i < 100; i++) {
    const next = c.frame(kind, 1 / fps, q)
    if (next) return next
  }
  return null
}

test('cada botão só responde aos seus quadros', () => {
  const q: Levels = { dpr: 1, steps: 160, motionDiv: 3 }
  const c = createCachedQuality(true)
  // Movimento lento muda o movimento e não o dpr.
  assert.deepEqual(feed(c, 'motion', 15, q), { ...q, motionDiv: 4 })
  // Parado rápido sobe o dpr e não mexe no movimento.
  assert.deepEqual(feed(c, 'idle', 60, q), { ...q, dpr: 1.25 })
  // Quadros de refino não contam.
  for (let i = 0; i < 100; i++) assert.equal(c.frame('refine', 1, q), null)
})

test('no celular o dpr pode subir até a tela física (até 2); no desktop, até 1,5', () => {
  assert.equal(maxDprFor(true, 2), 2)
  assert.equal(maxDprFor(true, 3), 2)
  assert.equal(maxDprFor(true, 1), MAX_DPR)
  assert.equal(maxDprFor(false, 2), MAX_DPR)
  const c = createCachedQuality(true, 2)
  let q: Levels = { dpr: 1.5, steps: 160, motionDiv: 3 }
  q = feed(c, 'idle', 60, q) ?? q
  assert.equal(q.dpr, 1.75)
})

test('movimento lento já no mínimo desce o dpr, e o parado não sobe acima dele', () => {
  const c = createCachedQuality(true, 2)
  let q: Levels = { dpr: 1.5, steps: MIN_STEPS, motionDiv: 4 }
  q = feed(c, 'motion', 15, q) ?? q
  assert.equal(q.dpr, 1.25)
  // Parado com folga: não volta para 1,5.
  assert.equal(feed(c, 'idle', 60, q), null)
})

test('a suavização espera a resolução parada ser avaliada sem mudar', () => {
  const c = createCachedQuality(true, 2)
  const q: Levels = { dpr: 2, steps: 160, motionDiv: 3 }
  assert.equal(c.stillSettled(), false)
  assert.equal(feed(c, 'idle', 40, q), null) // dentro da faixa: fica
  assert.equal(c.stillSettled(), true)
  // Uma troca (aqui, o movimento lento) zera a avaliação.
  assert.notEqual(feed(c, 'motion', 15, q), null)
  assert.equal(c.stillSettled(), false)
})

test('quadros muito longos (aba oculta, compilação) não derrubam a qualidade', () => {
  const q: Levels = { dpr: 1, steps: 160, motionDiv: 3 }
  const c = createCachedQuality(true)
  for (let i = 0; i < 100; i++) assert.equal(c.frame('idle', 5, q), null)
})

test('fps dentro da faixa não muda nada', () => {
  const q: Levels = { dpr: 1, steps: 160, motionDiv: 3 }
  assert.equal(feed(createCachedQuality(true), 'motion', 40, q), null)
  assert.equal(feed(createCachedQuality(false), 'idle', 55, q), null)
})

test('depois de oscilar, o botão para no nível mais baixo', () => {
  const c = createCachedQuality(false)
  let q: Levels = { dpr: 1, steps: MAX_STEPS, motionDiv: 1.5 }
  const seen: number[] = []
  for (let i = 0; i < 10; i++) {
    const next = feed(c, 'idle', i % 2 === 0 ? 30 : 200, q)
    if (next) q = next
    seen.push(q.dpr)
  }
  const last = seen.at(-1)!
  assert.equal(last, Math.min(...seen.slice(-4)))
  assert.ok(seen.slice(-3).every((x) => x === last))
})

test('faixas do refino: crescem enquanto cabem e caem pela metade quando passam', () => {
  const budget = 1 / 30
  let rows = 8
  for (let i = 0; i < 10; i++) rows = nextRefineRows(rows, 1 / 60, budget)
  assert.ok(rows > 50)
  const big = rows
  assert.equal(nextRefineRows(big, 0.05, budget), Math.floor(big / 2))
  assert.equal(nextRefineRows(big, budget * 1.1, budget), big) // perto da meta: mantém
  assert.equal(nextRefineRows(MIN_REFINE_ROWS, 1, budget), MIN_REFINE_ROWS)
})
