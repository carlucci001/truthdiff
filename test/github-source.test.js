import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  parseGitHubRepositoryUrl,
  resolveRemoteDocsPath,
  withClonedGitHubRepository,
} from '../src/github-source.js'

test('parses and canonicalizes public GitHub HTTPS repository URLs', () => {
  assert.deepEqual(
    parseGitHubRepositoryUrl('https://github.com/Farrington-Dev/truth_diff.git/'),
    {
      owner: 'Farrington-Dev',
      repository: 'truth_diff',
      cloneUrl: 'https://github.com/Farrington-Dev/truth_diff.git',
      repositoryUrl: 'https://github.com/Farrington-Dev/truth_diff',
    },
  )
  assert.equal(
    parseGitHubRepositoryUrl('https://github.com/example/.github').repository,
    '.github',
  )
})

test('rejects non-GitHub, credentialed, ambiguous, and non-HTTPS URLs', () => {
  const invalid = [
    'http://github.com/owner/repo',
    'https://github.example/owner/repo',
    'https://github.com.evil.test/owner/repo',
    'https://user:secret@github.com/owner/repo',
    'https://github.com:443/owner/repo',
    'https://github.com/owner/repo/issues',
    'https://github.com/owner/repo?token=secret',
    'https://github.com/owner/repo#readme',
    'git@github.com:owner/repo.git',
  ]
  for (const value of invalid) {
    assert.throws(() => parseGitHubRepositoryUrl(value), /github|https|repository/i)
  }
})

test('remote Markdown paths stay inside the cloned repository', async t => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'truthdiff-path-test-'))
  t.after(() => fs.promises.rm(root, { force: true, recursive: true }))
  await fs.promises.mkdir(path.join(root, 'docs'))

  assert.equal(resolveRemoteDocsPath(root, 'docs'), fs.realpathSync(path.join(root, 'docs')))
  for (const value of ['../docs', 'docs/../../outside', '/tmp/docs', 'C:\\docs', '\\\\server\\docs']) {
    assert.throws(() => resolveRemoteDocsPath(root, value), /relative path|cannot leave/)
  }
})

test('clones shallowly without credentials, verifies history, and removes the checkout', async () => {
  const calls = []
  let checkoutPath
  const fakeExecFile = async (file, args, options) => {
    calls.push({ file, args, options })
    if (args.includes('clone')) {
      checkoutPath = args.at(-1)
      await fs.promises.mkdir(path.join(checkoutPath, 'docs'), { recursive: true })
    }
    return { stdout: '', stderr: '' }
  }

  const result = await withClonedGitHubRepository(
    'https://github.com/owner/repo',
    async checkout => {
      assert.equal(fs.existsSync(checkout.repoPath), true)
      return checkout.repository.repositoryUrl
    },
    {
      environment: {
        ...process.env,
        HOME: 'C:\\secret-home',
        USERPROFILE: 'C:\\secret-profile',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'url.file:///tmp/evil.insteadOf',
        GIT_CONFIG_VALUE_0: 'https://github.com/',
        GIT_EXTERNAL_DIFF: 'malicious-diff',
      },
      execFile: fakeExecFile,
    },
  )

  assert.equal(result, 'https://github.com/owner/repo')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].file, 'git')
  const cloneArguments = calls[0].args.join('\0')
  assert.match(cloneArguments, /protocol\.allow=never/)
  assert.match(cloneArguments, /protocol\.https\.allow=always/)
  assert.match(cloneArguments, /filter\.lfs\.required=false/)
  assert.match(cloneArguments, /filter\.lfs\.smudge=/)
  assert.match(cloneArguments, /filter\.lfs\.process=/)
  assert.equal(calls[0].args.includes('--depth=2'), true)
  assert.equal(calls[0].args.includes('--single-branch'), true)
  assert.equal(calls[0].args.includes('--no-tags'), true)
  assert.equal(calls[0].args.includes('--'), true)
  assert.equal(calls[0].options.env.GIT_TERMINAL_PROMPT, '0')
  assert.equal(calls[0].options.env.GIT_CONFIG_NOSYSTEM, '1')
  assert.equal(calls[0].options.env.GIT_CONFIG_GLOBAL, calls[0].options.env.GIT_CONFIG_SYSTEM)
  assert.equal(path.dirname(calls[0].options.env.GIT_CONFIG_GLOBAL), calls[0].options.env.HOME)
  assert.equal(calls[0].options.env.GIT_LFS_SKIP_SMUDGE, '1')
  assert.equal(calls[0].options.env.HOME, calls[0].options.env.USERPROFILE)
  assert.equal(calls[0].options.env.HOME, calls[0].options.env.XDG_CONFIG_HOME)
  assert.notEqual(calls[0].options.env.HOME, 'C:\\secret-home')
  assert.notEqual(calls[0].options.env.USERPROFILE, 'C:\\secret-profile')
  assert.equal('GIT_CONFIG_COUNT' in calls[0].options.env, false)
  assert.equal('GIT_CONFIG_KEY_0' in calls[0].options.env, false)
  assert.equal('GIT_CONFIG_VALUE_0' in calls[0].options.env, false)
  assert.equal('GIT_EXTERNAL_DIFF' in calls[0].options.env, false)
  assert.equal(calls[0].options.maxBuffer, 1024 * 1024)
  assert.equal(calls[0].options.timeout, 30_000)
  assert.match(calls[1].args.join('\0'), /protocol\.allow=never/)
  assert.equal(calls[1].args.includes('HEAD~1^{commit}'), true)
  assert.equal(fs.existsSync(path.dirname(checkoutPath)), false)
})

test('reports insufficient remote history clearly and still removes the checkout', async () => {
  let checkoutPath
  const fakeExecFile = async (_file, args) => {
    if (args.includes('clone')) {
      checkoutPath = args.at(-1)
      await fs.promises.mkdir(checkoutPath, { recursive: true })
      return { stdout: '', stderr: '' }
    }
    throw new Error('unknown revision')
  }

  await assert.rejects(
    withClonedGitHubRepository(
      'https://github.com/owner/repo',
      async () => assert.fail('operation must not run'),
      { execFile: fakeExecFile },
    ),
    /at least two commits/,
  )
  assert.equal(fs.existsSync(path.dirname(checkoutPath)), false)
})
