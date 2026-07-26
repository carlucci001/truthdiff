import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGitDiff } from '../src/git.js'

test('parses file changes and identifier deltas from a unified diff', () => {
  const files = parseGitDiff(`
diff --git a/app/api/old/route.js b/app/api/new/route.js
similarity index 80%
rename from app/api/old/route.js
rename to app/api/new/route.js
--- a/app/api/old/route.js
+++ b/app/api/new/route.js
@@ -1 +1 @@
-const key = process.env.OLD_API_KEY
-fetch('/api/old/items')
+const key = process.env.NEW_API_KEY
+fetch('/api/new/items')
`)

  assert.equal(files.length, 1)
  assert.equal(files[0].status, 'renamed')
  assert.equal(files[0].previousPath, 'app/api/old/route.js')
  assert.equal(files[0].path, 'app/api/new/route.js')
  assert.deepEqual(files[0].removedIdentifiers, [
    { kind: 'config', value: 'OLD_API_KEY' },
    { kind: 'route', value: '/api/old/items' },
    { kind: 'symbol', value: 'key' },
  ])
  assert.deepEqual(files[0].addedIdentifiers, [
    { kind: 'config', value: 'NEW_API_KEY' },
    { kind: 'route', value: '/api/new/items' },
    { kind: 'symbol', value: 'key' },
  ])
})
