import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
])
const DEFAULT_MAX_DOCUMENTS = 2_000
const DEFAULT_MAX_DOCUMENT_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 20 * 1024 * 1024

function normalizedRelative(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function walkMarkdown(root, limits, dir = root, state = { bytes: 0, files: [] }) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    if (entry.name.startsWith('.') && entry.name !== '.claude') continue
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkMarkdown(root, limits, fullPath, state)
    } else if (entry.name.toLowerCase().endsWith('.md')) {
      const file = fs.statSync(fullPath)
      if (!file.isFile()) continue
      if (file.size > limits.maxFileBytes) {
        throw new Error(`Markdown file exceeds the ${limits.maxFileBytes}-byte scan limit: ${normalizedRelative(root, fullPath)}`)
      }
      if (state.files.length >= limits.maxFiles) {
        throw new Error(`Markdown folder exceeds the ${limits.maxFiles}-file scan limit.`)
      }
      if (state.bytes + file.size > limits.maxBytes) {
        throw new Error(`Markdown folder exceeds the ${limits.maxBytes}-byte scan limit.`)
      }
      state.bytes += file.size
      state.files.push(fullPath)
    }
  }
  return state.files
}

export function extractDocumentLinks(content) {
  const links = []
  const seen = new Set()
  const add = value => {
    const clean = String(value || '').trim().replace(/\.md(?:#.*)?$/i, '')
    if (!clean || seen.has(clean.toLowerCase())) return
    seen.add(clean.toLowerCase())
    links.push(clean)
  }

  for (const match of String(content || '').matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
    add(match[1])
  }
  for (const match of String(content || '').matchAll(/\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g)) {
    add(match[1])
  }
  return links
}

export function normalizeDocument(input) {
  const content = String(input.content || '')
  const firstHeading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const fallbackTitle = path.basename(String(input.id || 'document'), path.extname(String(input.id || '')))
  return {
    id: String(input.id || ''),
    path: input.path ? path.resolve(input.path) : '',
    title: String(input.title || firstHeading || fallbackTitle),
    content,
    links: extractDocumentLinks(content),
    sourceRoot: String(input.sourceRoot || ''),
    sourceName: String(input.sourceName || ''),
    sourceColor: String(input.sourceColor || ''),
  }
}

export function loadMarkdownDocuments(docsPath, options = {}) {
  const root = path.resolve(docsPath)
  if (!fs.existsSync(root)) throw new Error(`Markdown path does not exist: ${root}`)
  const limits = {
    maxFiles: Math.max(1, Number(options.maxFiles) || DEFAULT_MAX_DOCUMENTS),
    maxFileBytes: Math.max(1, Number(options.maxFileBytes) || DEFAULT_MAX_DOCUMENT_BYTES),
    maxBytes: Math.max(1, Number(options.maxBytes) || DEFAULT_MAX_TOTAL_BYTES),
  }
  return walkMarkdown(root, limits).map(filePath => normalizeDocument({
    id: normalizedRelative(root, filePath),
    path: filePath,
    content: fs.readFileSync(filePath, 'utf8'),
  }))
}
