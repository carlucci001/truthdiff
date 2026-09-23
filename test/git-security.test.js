import assert from 'node:assert/strict'
import test from 'node:test'

import { parseGitDiff, readGitChangeSet } from '../src/git.js'

test('Git diff disables external processors and has an execution timeout', () => {
  let invocation
  readGitChangeSet({
    repoPath: '.',
    base: 'HEAD',
    execFileSync(file, args, options) {
      invocation = { file, args, options }
      return ''
    },
  })

  assert.equal(invocation.file, 'git')
  assert.equal(invocation.args.includes('--no-ext-diff'), true)
  assert.equal(invocation.args.includes('--no-textconv'), true)
  assert.equal(invocation.options.timeout, 15_000)
  assert.equal(invocation.options.maxBuffer, 50 * 1024 * 1024)
})

test('Git diff parsing enforces changed file and content budgets', () => {
  const twoFiles = [
    'diff --git a/a.js b/a.js',
    '+const a = true',
    'diff --git a/b.js b/b.js',
    '+const b = true',
  ].join('\n')
  assert.throws(() => parseGitDiff(twoFiles, { maxFiles: 1 }), /changed-file scan limit/)
  assert.throws(
    () => parseGitDiff('diff --git a/a.js b/a.js\n+12345', { maxCharactersPerFile: 4 }),
    /per-file scan limit/,
  )
})
