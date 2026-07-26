import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeImpact, identifierKey } from '../src/analyze.js'
import { normalizeDocument } from '../src/documents.js'

const changeSet = {
  fingerprint: 'fixture-sha',
  files: [{
    path: 'app/api/auth/route.js',
    previousPath: 'app/api/auth/route.js',
    status: 'modified',
    addedIdentifiers: [{ kind: 'config', value: 'NEW_AUTH_KEY' }],
    removedIdentifiers: [
      { kind: 'config', value: 'OLD_AUTH_KEY' },
      { kind: 'symbol', value: 'resolveSession' },
    ],
  }],
}

test('creates deterministic contradictions only for confirmed absent identifiers', () => {
  const graph = analyzeImpact({
    changeSet,
    documents: [normalizeDocument({
      id: 'runbooks/auth.md',
      content: '# Auth\n\nSet OLD_AUTH_KEY before starting the service.',
    })],
    identifierStatus: {
      [identifierKey({ kind: 'config', value: 'OLD_AUTH_KEY' })]: 'absent',
    },
  })

  assert.equal(graph.summary.counts.contradicted, 1)
  assert.equal(graph.findings[0].deterministic, true)
  assert.equal(graph.edges[0].state, 'contradicted')
})

test('keeps changed symbols and unknown identifiers in review', () => {
  const graph = analyzeImpact({
    changeSet,
    documents: [normalizeDocument({
      id: 'architecture/auth.md',
      content: '# Auth\n\nresolveSession owns the authentication flow.',
    })],
  })

  assert.equal(graph.summary.counts.contradicted, 0)
  assert.equal(graph.summary.counts.review, 1)
})

test('semantic candidates can only create review findings', () => {
  const graph = analyzeImpact({
    changeSet,
    documents: [normalizeDocument({
      id: 'decisions/security.md',
      content: '# Security decisions',
    })],
    semanticCandidates: [{
      documentId: 'decisions/security.md',
      sourceId: 'app/api/auth/route.js',
      score: 0.95,
    }],
  })

  assert.equal(graph.findings[0].state, 'review')
  assert.equal(graph.findings[0].deterministic, false)
  assert.equal(graph.findings[0].confidence, 0.79)
})

test('does not flag unrelated documents', () => {
  const graph = analyzeImpact({
    changeSet,
    documents: [normalizeDocument({
      id: 'recipes/pasta.md',
      content: '# Pasta\n\nBoil salted water.',
    })],
  })

  assert.equal(graph.summary.affectedDocuments, 0)
  assert.equal(graph.nodes.length, 1)
})
