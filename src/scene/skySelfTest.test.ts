// A cópia em JavaScript do hash e do ruído do céu tem que dar o mesmo que o
// shader. Os valores de referência foram lidos da GPU (RTX 3060, ANGLE/D3D11)
// pelo autoteste do ?debug. Se o shader mudar essas funções, este teste falha
// até a cópia ser atualizada.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selfTestExpected } from './skySelfTest.ts'

test('hash, ruído e fbm da CPU batem com os lidos da GPU', () => {
  const cpu = selfTestExpected()
  assert.equal(cpu.hash.toFixed(5), '0.69184')
  assert.equal(cpu.noise.toFixed(5), '0.26651')
  assert.equal(cpu.fbm.toFixed(5), '0.37011')
})
