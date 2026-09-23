import assert from 'node:assert/strict'
import test from 'node:test'

import { createDemoGraph } from '../src/demo.js'

test('preview demo includes proof, review, and unrelated-document controls', () => {
  const graph = createDemoGraph()

  assert.equal(graph.summary.changedFiles, 5)
  assert.equal(graph.summary.counts.contradicted, 3)
  assert.equal(graph.summary.counts.review, 5)
  assert.equal(graph.summary.affectedDocuments, 6)
  assert.equal(
    graph.findings.find(finding => finding.state === 'contradicted').deterministic,
    true,
  )
  assert.equal(
    graph.findings.some(finding => finding.documentId === 'docs/brand-guide.md'),
    false,
  )
})
