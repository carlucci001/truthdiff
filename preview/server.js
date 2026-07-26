import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runCheck } from '../src/cli.js'
import { createDemoGraph } from '../src/demo.js'

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
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 32_768) throw new Error('Request body is too large')
  }
  return JSON.parse(body || '{}')
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

export function createPreviewServer() {
  const token = crypto.randomBytes(24).toString('base64url')
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')

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
      if (request.method === 'POST' && url.pathname === '/api/analyze') {
        try {
          const input = await requestBody(request)
          if (!input.repo || !input.docs) {
            return json(response, 400, {
              error: 'Repository and Markdown paths are required.',
            })
          }
          const requestedRange = String(input.range || 'working')
          const [base, head] =
            requestedRange === 'last-commit'
              ? ['HEAD~1', 'HEAD']
              : requestedRange.includes('..')
                ? requestedRange.split('..', 2)
                : ['HEAD', null]
          const graph = await runCheck({
            repo: input.repo,
            docs: input.docs,
            base,
            head,
          })
          return json(response, 200, graph)
        } catch (error) {
          return json(response, 400, { error: error.message })
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
  const server = createPreviewServer()
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
