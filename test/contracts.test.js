import assert from 'node:assert/strict'
import test from 'node:test'
import { createFinding } from '../src/contracts.js'

test('contradicted findings require deterministic evidence', () => {
  assert.throws(() => createFinding({
    id: 'f-1',
    state: 'contradicted',
    reason: 'Semantic similarity only',
    confidence: 0.9,
    deterministic: false,
  }), /deterministic evidence/)
})

test('review findings may be inferred', () => {
  const finding = createFinding({
    id: 'f-2',
    state: 'review',
    documentId: 'docs/auth.md',
    sourceId: 'app/auth.js',
    reason: 'Related configuration changed',
    confidence: 0.7,
    deterministic: false,
  })

  assert.equal(finding.state, 'review')
  assert.equal(finding.deterministic, false)
})

