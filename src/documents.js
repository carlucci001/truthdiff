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

function normalizedRelative(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function walkMarkdown(root, dir = root, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.claude') continue
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMarkdown(root, fullPath, output)
    else if (entry.name.toLowerCase().endsWith('.md')) output.push(fullPath)
  }
  return output
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

export function loadMarkdownDocuments(docsPath) {
  const root = path.resolve(docsPath)
  if (!fs.existsSync(root)) throw new Error(`Markdown path does not exist: ${root}`)
  return walkMarkdown(root).map(filePath => normalizeDocument({
    id: normalizedRelative(root, filePath),
    path: filePath,
    content: fs.readFileSync(filePath, 'utf8'),
  }))
}
