import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { startPreviewServer } from '../preview/server.js'
import { parseGitHubRepositoryUrl } from '../src/github-source.js'

function git(repoPath, ...args) {
  return execFileSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

async function createRepository(t, { workingChange = false } = {}) {
  const repoPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'truthdiff-api-test-'))
  t.after(() => fs.promises.rm(repoPath, { force: true, recursive: true }))
  await fs.promises.mkdir(path.join(repoPath, 'docs'))
  await fs.promises.mkdir(path.join(repoPath, 'src'))
  await fs.promises.writeFile(path.join(repoPath, 'docs', 'guide.md'), '# Guide\n\nUse `legacyRoute` safely.\n')
  await fs.promises.writeFile(path.join(repoPath, 'src', 'app.js'), 'export function legacyRoute() {}\n')
  git(repoPath, 'init', '--quiet')
  git(repoPath, 'config', 'user.email', 'tests@truthdiff.local')
  git(repoPath, 'config', 'user.name', 'TruthDiff Tests')
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '--quiet', '-m', 'initial')
  await fs.promises.writeFile(path.join(repoPath, 'src', 'app.js'), 'export function currentRoute() {}\n')
  if (!workingChange) {
    git(repoPath, 'add', '.')
    git(repoPath, 'commit', '--quiet', '-m', 'change route')
  }
  return repoPath
}

async function api(url, token, pathname, options = {}) {
  const headers = new Headers(options.headers)
  if (token) headers.set('X-TruthDiff-Token', token)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${url}${pathname}`, { ...options, headers })
  const body = await response.json()
  return { response, body }
}

function rawGet(url, headers) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        status: response.statusCode,
      }))
    })
    request.on('error', reject)
  })
}

test('keeps local analysis compatible and records bounded authenticated history', async t => {
  const repoPath = await createRepository(t, { workingChange: true })
  const docsPath = path.join(repoPath, 'docs')
  const { server, url } = await startPreviewServer({ port: 0, historyLimit: 2 })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const config = await fetch(`${url}/api/config`).then(response => response.json())

  const forbidden = await api(url, '', '/api/runs')
  assert.equal(forbidden.response.status, 403)

  const first = await api(url, config.token, '/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ repo: repoPath, docs: docsPath, range: 'working' }),
  })
  assert.equal(first.response.status, 200)
  assert.equal(first.body.source.type, 'local')
  assert.equal(first.body.source.repositoryPath, path.resolve(repoPath))
  assert.equal(first.body.source.comparison.base, 'HEAD')
  assert.equal(Array.isArray(first.body.nodes), true)
  assert.equal(Array.isArray(first.body.findings), true)
  assert.ok(first.body.run.id)

  const second = await api(url, config.token, '/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ repo: repoPath, docs: docsPath }),
  })
  const third = await api(url, config.token, '/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ repo: repoPath, docs: docsPath }),
  })
  assert.equal(second.response.status, 200)
  assert.equal(third.response.status, 200)

  const history = await api(url, config.token, '/api/runs')
  assert.equal(history.response.status, 200)
  assert.equal(history.body.runs.length, 2)
  assert.equal(history.body.runs[0].id, third.body.run.id)
  assert.equal(history.body.runs[1].id, second.body.run.id)
  assert.equal(history.body.runs[0].source.type, 'local')
  assert.equal(history.body.runs[0].summary !== undefined, true)

  const detail = await api(url, config.token, `/api/runs/${third.body.run.id}`)
  assert.equal(detail.response.status, 200)
  assert.equal(detail.body.run.id, third.body.run.id)
  assert.equal(detail.body.graph.summary !== undefined, true)

  const missingDetail = await api(url, config.token, '/api/runs/00000000-0000-0000-0000-000000000000')
  assert.equal(missingDetail.response.status, 404)
})

test('rejects unlisted Git ranges before Git can interpret options', async t => {
  const repoPath = await createRepository(t, { workingChange: true })
  const outputPath = path.join(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'truthdiff-range-output-')), 'written')
  t.after(() => fs.promises.rm(path.dirname(outputPath), { force: true, recursive: true }))
  const { server, url } = await startPreviewServer({ port: 0 })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const config = await fetch(`${url}/api/config`).then(response => response.json())

  const result = await api(url, config.token, '/api/analyze', {
    method: 'POST',
    body: JSON.stringify({
      repo: repoPath,
      docs: path.join(repoPath, 'docs'),
      range: `--output=${outputPath}..HEAD`,
    }),
  })
  assert.equal(result.response.status, 400)
  assert.match(result.body.error, /Comparison must be/)
  assert.equal(fs.existsSync(outputPath), false)
})

test('rejects hostile Host and Origin headers before exposing API configuration', async t => {
  const { server, url } = await startPreviewServer({ port: 0 })
  t.after(() => new Promise(resolve => server.close(resolve)))

  const hostileHost = await rawGet(`${url}/api/config`, { Host: 'attacker.example' })
  assert.equal(hostileHost.status, 403)
  assert.equal('token' in hostileHost.body, false)

  const hostileOrigin = await fetch(`${url}/api/config`, {
    headers: { Origin: 'https://attacker.example' },
  })
  assert.equal(hostileOrigin.status, 403)
  assert.equal('token' in await hostileOrigin.json(), false)
})

test('remote analysis uses a repository-relative docs path and prior commit comparison', async t => {
  const repoPath = await createRepository(t)
  const remoteRunner = async (url, operation) => operation({
    repoPath,
    repository: parseGitHubRepositoryUrl(url),
  })
  const { server, url } = await startPreviewServer({ port: 0, remoteRunner })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const config = await fetch(`${url}/api/config`).then(response => response.json())

  const result = await api(url, config.token, '/api/analyze', {
    method: 'POST',
    body: JSON.stringify({
      repo: 'https://github.com/owner/public-repo',
      docs: 'docs',
      range: 'HEAD~1..HEAD',
    }),
  })
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.body.source, {
    type: 'github',
    repositoryUrl: 'https://github.com/owner/public-repo',
    owner: 'owner',
    repository: 'public-repo',
    docsPath: 'docs',
    comparison: { range: 'last-commit', base: 'HEAD~1', head: 'HEAD' },
  })

  const traversal = await api(url, config.token, '/api/analyze', {
    method: 'POST',
    body: JSON.stringify({
      repo: 'https://github.com/owner/public-repo',
      docs: '../docs',
    }),
  })
  assert.equal(traversal.response.status, 400)
  assert.match(traversal.body.error, /cannot leave/)

  const unsupportedRange = await api(url, config.token, '/api/analyze', {
    method: 'POST',
    body: JSON.stringify({
      repo: 'https://github.com/owner/public-repo',
      docs: 'docs',
      range: 'main..HEAD',
    }),
  })
  assert.equal(unsupportedRange.response.status, 400)
  assert.match(unsupportedRange.body.error, /prior commit/)
})

test('allows only one remote scan at a time', async t => {
  const repoPath = await createRepository(t)
  let signalStarted
  let releaseScan
  const started = new Promise(resolve => { signalStarted = resolve })
  const gate = new Promise(resolve => { releaseScan = resolve })
  const remoteRunner = async (repositoryUrl, operation) => {
    signalStarted()
    await gate
    return operation({
      repoPath,
      repository: parseGitHubRepositoryUrl(repositoryUrl),
    })
  }
  const { server, url } = await startPreviewServer({ port: 0, remoteRunner })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const config = await fetch(`${url}/api/config`).then(response => response.json())
  const request = {
    method: 'POST',
    body: JSON.stringify({
      repo: 'https://github.com/owner/public-repo',
      docs: 'docs',
      range: 'HEAD~1..HEAD',
    }),
  }

  const firstRequest = api(url, config.token, '/api/analyze', request)
  await started
  const second = await api(url, config.token, '/api/analyze', request)
  assert.equal(second.response.status, 429)
  assert.match(second.body.error, /already running/)
  releaseScan()
  const first = await firstRequest
  assert.equal(first.response.status, 200)
})

test('analysis request bodies are bounded', async t => {
  const { server, url } = await startPreviewServer({ port: 0 })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const config = await fetch(`${url}/api/config`).then(response => response.json())
  const result = await api(url, config.token, '/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ repo: `C:\\${'x'.repeat(33_000)}`, docs: 'docs' }),
  })
  assert.equal(result.response.status, 413)
  assert.match(result.body.error, /too large/)
})
