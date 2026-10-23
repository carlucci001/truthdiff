import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runCheck } from '../src/cli.js'
import { createDemoGraph } from '../src/demo.js'
import {
  isGitHubRepositoryUrl,
  resolveRemoteDocsPath,
  withClonedGitHubRepository,
} from '../src/github-source.js'

const PREVIEW_ROOT = path.dirname(fileURLToPath(import.meta.url))
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
])

function json(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

async function requestBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 32_768) {
      const error = new Error('Request body is too large')
      error.code = 'BODY_TOO_LARGE'
      throw error
    }
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function comparisonFor(input, remote = false) {
  const requestedRange = String(input.range || (remote ? 'last-commit' : 'working'))
  if (remote) {
    if (!['working', 'last-commit', 'HEAD~1..HEAD'].includes(requestedRange)) {
      throw new Error('GitHub scans currently compare only the prior commit with HEAD.')
    }
    return { range: 'last-commit', base: 'HEAD~1', head: 'HEAD' }
  }
  const comparisons = {
    working: { range: 'working', base: 'HEAD', head: null },
    'last-commit': { range: 'last-commit', base: 'HEAD~1', head: 'HEAD' },
    'HEAD~1..HEAD': { range: 'HEAD~1..HEAD', base: 'HEAD~1', head: 'HEAD' },
    'main..HEAD': { range: 'main..HEAD', base: 'main', head: 'HEAD' },
  }
  const comparison = comparisons[requestedRange]
  if (!comparison) {
    throw new Error('Comparison must be working, last-commit, HEAD~1..HEAD, or main..HEAD.')
  }
  return comparison
}

function trustedLocalRequest(request) {
  const host = String(request.headers.host || '')
  let target
  try {
    target = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!['127.0.0.1', 'localhost'].includes(target.hostname.toLowerCase())) return false

  const origin = request.headers.origin
  if (!origin) return true
  try {
    const parsedOrigin = new URL(origin)
    return parsedOrigin.protocol === 'http:' && parsedOrigin.host.toLowerCase() === target.host.toLowerCase()
  } catch {
    return false
  }
}

async function analyzeInput(input, remoteRunner) {
  if (!input.repo || !input.docs) {
    throw new Error('Repository and Markdown paths are required.')
  }

  if (isGitHubRepositoryUrl(input.repo)) {
    const comparison = comparisonFor(input, true)
    return remoteRunner(input.repo, async ({ repoPath, repository }) => {
      const docsPath = resolveRemoteDocsPath(repoPath, input.docs)
      const graph = await runCheck({
        repo: repoPath,
        docs: docsPath,
        base: comparison.base,
        head: comparison.head,
      })
      return {
        ...graph,
        source: {
          type: 'github',
          repositoryUrl: repository.repositoryUrl,
          owner: repository.owner,
          repository: repository.repository,
          docsPath: String(input.docs).trim().replace(/\\/g, '/'),
          comparison,
        },
      }
    })
  }

  const comparison = comparisonFor(input)
  const graph = await runCheck({
    repo: input.repo,
    docs: input.docs,
    base: comparison.base,
    head: comparison.head,
  })
  return {
    ...graph,
    source: {
      type: 'local',
      repositoryPath: path.resolve(input.repo),
      docsPath: path.resolve(input.docs),
      comparison,
    },
  }
}

function previewPort(argv) {
  const index = argv.indexOf('--port')
  const value = index >= 0 ? argv[index + 1] : process.env.TRUTHDIFF_PREVIEW_PORT
  const parsed = Number(value || 4177)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid preview port: ${value}`)
  }
  return parsed
}

export function createPreviewServer(options = {}) {
  const token = options.token || crypto.randomBytes(24).toString('base64url')
  const historyLimit = Math.max(1, Math.min(100, Number(options.historyLimit) || 25))
  const recentRuns = []
  const recentRunGraphs = new Map()
  const remoteRunner = options.remoteRunner || withClonedGitHubRepository
  let remoteScanInProgress = false

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')

    if (url.pathname.startsWith('/api/') && !trustedLocalRequest(request)) {
      return json(response, 403, { error: 'Requests must originate from this local TruthDiff server.' })
    }

    if (request.method === 'GET' && url.pathname === '/api/config') {
      return json(response, 200, { token, localOnly: true })
    }
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json(response, 200, { ok: true, product: 'TruthDiff Preview' })
    }

    if (url.pathname.startsWith('/api/')) {
      if (request.headers['x-truthdiff-token'] !== token) {
        return json(response, 403, { error: 'Invalid preview token' })
      }
      if (request.method === 'GET' && url.pathname === '/api/demo') {
        return json(response, 200, createDemoGraph())
      }
      if (request.method === 'GET' && url.pathname === '/api/runs') {
        return json(response, 200, { runs: recentRuns })
      }
      const runDetailMatch = request.method === 'GET' && url.pathname.match(/^\/api\/runs\/([0-9a-f-]+)$/i)
      if (runDetailMatch) {
        const run = recentRuns.find(item => item.id === runDetailMatch[1])
        const graph = recentRunGraphs.get(runDetailMatch[1])
        if (!run || !graph) return json(response, 404, { error: 'Saved scan not found' })
        return json(response, 200, { run, graph })
      }
      if (request.method === 'POST' && url.pathname === '/api/analyze') {
        try {
          const input = await requestBody(request)
          const remote = isGitHubRepositoryUrl(input.repo)
          if (remote && remoteScanInProgress) {
            return json(response, 429, { error: 'A GitHub scan is already running. Try again when it finishes.' })
          }
          if (remote) remoteScanInProgress = true
          let graph
          try {
            graph = await analyzeInput(input, remoteRunner)
          } finally {
            if (remote) remoteScanInProgress = false
          }
          const run = {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            source: graph.source,
            summary: graph.summary,
          }
          recentRuns.unshift(run)
          recentRunGraphs.set(run.id, graph)
          while (recentRuns.length > historyLimit) {
            const removed = recentRuns.pop()
            if (removed) recentRunGraphs.delete(removed.id)
          }
          return json(response, 200, { ...graph, run: { id: run.id, createdAt: run.createdAt } })
        } catch (error) {
          return json(response, error.code === 'BODY_TOO_LARGE' ? 413 : 400, {
            error: error.message,
          })
        }
      }
      return json(response, 404, { error: 'Not found' })
    }

    if (url.pathname === '/favicon.ico' && request.method === 'GET') {
      response.writeHead(204, { 'Cache-Control': 'no-store' })
      return response.end()
    }

    const staticFile = STATIC_FILES.get(url.pathname)
    if (!staticFile || request.method !== 'GET') {
      response.writeHead(404)
      return response.end('Not found')
    }
    const [fileName, contentType] = staticFile
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'",
      'Content-Type': contentType,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
    fs.createReadStream(path.join(PREVIEW_ROOT, fileName)).pipe(response)
  })
}

export async function startPreviewServer(options = {}) {
  const requestedPort = options.port ?? previewPort(process.argv.slice(2))
  const server = createPreviewServer(options)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(requestedPort, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : requestedPort
  return { server, url: `http://127.0.0.1:${port}` }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const { url } = await startPreviewServer()
  console.log(`TruthDiff preview: ${url}`)
  console.log('Local-only server. Press Ctrl+C to stop.')
}
