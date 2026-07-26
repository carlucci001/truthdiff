import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { extractDocumentLinks, loadMarkdownDocuments } from '../src/documents.js'

test('extracts Wiki and Markdown document links', () => {
  assert.deepEqual(
    extractDocumentLinks('See [[Authentication|Auth]] and [Routes](api/routes.md#public).'),
    ['Authentication', 'api/routes'],
  )
})

test('loads normalized Markdown documents recursively', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'truthdiff-docs-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'runbooks'))
  fs.writeFileSync(path.join(root, 'runbooks', 'auth.md'), '# Authentication\n\nUses AUTH_KEY.\n')
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.writeFileSync(path.join(root, 'node_modules', 'ignored.md'), '# Ignore\n')

  const documents = loadMarkdownDocuments(root)
  assert.equal(documents.length, 1)
  assert.equal(documents[0].id, 'runbooks/auth.md')
  assert.equal(documents[0].title, 'Authentication')
  assert.match(documents[0].content, /AUTH_KEY/)
})
