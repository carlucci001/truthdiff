import assert from 'node:assert/strict'
import test from 'node:test'
import { extractIdentifiers } from '../src/identifiers.js'

test('extracts routes, configuration keys, and symbols', () => {
  const identifiers = extractIdentifiers(`
    const tenantHeader = process.env.NEWSROOM_API_KEY
    function resolveTenant() {}
    fetch('/api/tenant/articles')
  `)

  assert.deepEqual(identifiers, [
    { kind: 'config', value: 'NEWSROOM_API_KEY' },
    { kind: 'route', value: '/api/tenant/articles' },
    { kind: 'symbol', value: 'tenantHeader' },
    { kind: 'symbol', value: 'resolveTenant' },
  ])
})

test('deduplicates identifiers and ignores common uppercase words', () => {
  const identifiers = extractIdentifiers('API API CRM_DATA_DIR CRM_DATA_DIR')
  assert.deepEqual(identifiers, [
    { kind: 'config', value: 'CRM_DATA_DIR' },
  ])
})
