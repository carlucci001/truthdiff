import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import { extractIdentifiers } from './identifiers.js'

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/')
}

export function parseGitDiff(rawDiff) {
  const files = []
  let current = null

  for (const line of String(rawDiff || '').split(/\r?\n/)) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (header) {
      current = {
        path: normalizePath(header[2]),
        previousPath: normalizePath(header[1]),
        status: 'modified',
        addedLines: [],
        removedLines: [],
      }
      files.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('new file mode ')) current.status = 'added'
    if (line.startsWith('deleted file mode ')) current.status = 'deleted'
    if (line.startsWith('rename from ')) {
      current.status = 'renamed'
      current.previousPath = normalizePath(line.slice('rename from '.length))
    }
    if (line.startsWith('rename to ')) {
      current.path = normalizePath(line.slice('rename to '.length))
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) current.addedLines.push(line.slice(1))
    if (line.startsWith('-')) current.removedLines.push(line.slice(1))
  }

  return files.map(file => ({
    ...file,
    addedIdentifiers: extractIdentifiers(file.addedLines.join('\n')),
    removedIdentifiers: extractIdentifiers(file.removedLines.join('\n')),
  }))
}

export function readGitChangeSet(options = {}) {
  const repoPath = path.resolve(options.repoPath || process.cwd())
  const base = options.base || 'HEAD'
  const head = options.head || ''
  const args = ['-C', repoPath, 'diff', '--no-color', '--unified=0']
  if (head) args.push(`${base}..${head}`)
  else args.push(base)
  args.push('--')

  const rawDiff = execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })

  return {
    repoPath,
    base,
    head: head || 'WORKTREE',
    fingerprint: crypto.createHash('sha256').update(rawDiff).digest('hex'),
    files: parseGitDiff(rawDiff),
  }
}

