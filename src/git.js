import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import { extractIdentifiers } from './identifiers.js'

const DEFAULT_MAX_CHANGED_FILES = 5_000
const DEFAULT_MAX_CHANGED_CHARACTERS_PER_FILE = 2 * 1024 * 1024
const DEFAULT_MAX_IDENTIFIERS_PER_FILE = 5_000

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/')
}

export function parseGitDiff(rawDiff, options = {}) {
  const maxFiles = Math.max(1, Number(options.maxFiles) || DEFAULT_MAX_CHANGED_FILES)
  const maxCharactersPerFile = Math.max(
    1,
    Number(options.maxCharactersPerFile) || DEFAULT_MAX_CHANGED_CHARACTERS_PER_FILE,
  )
  const maxIdentifiersPerFile = Math.max(
    1,
    Number(options.maxIdentifiersPerFile) || DEFAULT_MAX_IDENTIFIERS_PER_FILE,
  )
  const files = []
  let current = null

  for (const line of String(rawDiff || '').split(/\r?\n/)) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (header) {
      if (files.length >= maxFiles) {
        throw new Error(`Git diff exceeds the ${maxFiles}-changed-file scan limit.`)
      }
      current = {
        path: normalizePath(header[2]),
        previousPath: normalizePath(header[1]),
        status: 'modified',
        addedLines: [],
        changedCharacters: 0,
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
    if (line.startsWith('+') || line.startsWith('-')) {
      const content = line.slice(1)
      current.changedCharacters += content.length
      if (current.changedCharacters > maxCharactersPerFile) {
        throw new Error(`Changed content exceeds the ${maxCharactersPerFile}-character per-file scan limit: ${current.path}`)
      }
      if (line.startsWith('+')) current.addedLines.push(content)
      else current.removedLines.push(content)
    }
  }

  return files.map(file => {
    const { changedCharacters, ...output } = file
    const addedIdentifiers = extractIdentifiers(file.addedLines.join('\n'))
    const removedIdentifiers = extractIdentifiers(file.removedLines.join('\n'))
    if (addedIdentifiers.length + removedIdentifiers.length > maxIdentifiersPerFile) {
      throw new Error(`Changed file exceeds the ${maxIdentifiersPerFile}-identifier scan limit: ${file.path}`)
    }
    return { ...output, addedIdentifiers, removedIdentifiers }
  })
}

export function readGitChangeSet(options = {}) {
  const repoPath = path.resolve(options.repoPath || process.cwd())
  const base = options.base || 'HEAD'
  const head = options.head || ''
  const args = [
    '-C', repoPath, 'diff', '--no-color', '--no-ext-diff', '--no-textconv',
    '--unified=0',
  ]
  if (head) args.push(`${base}..${head}`)
  else args.push(base)
  args.push('--')

  const run = options.execFileSync || execFileSync
  const rawDiff = run('git', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: options.timeoutMs || 15_000,
    windowsHide: true,
  })

  return {
    repoPath,
    base,
    head: head || 'WORKTREE',
    fingerprint: crypto.createHash('sha256').update(rawDiff).digest('hex'),
    files: parseGitDiff(rawDiff, {
      maxCharactersPerFile: options.maxCharactersPerFile,
      maxFiles: options.maxFiles,
      maxIdentifiersPerFile: options.maxIdentifiersPerFile,
    }),
  }
}
