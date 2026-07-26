import assert from 'node:assert/strict'
import test from 'node:test'

import { startPreviewServer } from '../preview/server.js'

test('preview server is loopback-only and protects analysis endpoints', async () => {
  const { server, url } = await startPreviewServer({ port: 0 })
  try {
    const config = await fetch(`${url}/api/config`).then(response => response.json())
    assert.equal(config.localOnly, true)

    const forbidden = await fetch(`${url}/api/demo`)
    assert.equal(forbidden.status, 403)

    const demo = await fetch(`${url}/api/demo`, {
      headers: { 'X-TruthDiff-Token': config.token },
    }).then(response => response.json())
    assert.equal(demo.summary.counts.contradicted, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
