const COMMON_UPPERCASE = new Set([
  'API',
  'CLI',
  'CSS',
  'HTML',
  'HTTP',
  'HTTPS',
  'JSON',
  'TODO',
  'URL',
])

const COMMON_SYMBOLS = new Set([
  'args',
  'data',
  'error',
  'event',
  'files',
  'graph',
  'hit',
  'item',
  'items',
  'options',
  'props',
  'request',
  'response',
  'result',
  'results',
  'source',
  'state',
  'value',
  'values',
])

function unique(items) {
  const seen = new Set()
  return items.filter(item => {
    const key = `${item.kind}\0${item.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function isMeaningfulIdentifier(identifier) {
  if (identifier?.kind !== 'symbol') return true
  const value = String(identifier.value || '')
  return value.length > 1 && !COMMON_SYMBOLS.has(value.toLowerCase())
}

export function extractIdentifiers(text) {
  const source = String(text || '')
  const identifiers = []

  for (const match of source.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)) {
    if (!COMMON_UPPERCASE.has(match[0])) {
      identifiers.push({ kind: 'config', value: match[0] })
    }
  }

  for (const match of source.matchAll(/(?:^|[\s"'`(])((?:\/(?:api|portal|admin|auth|webhooks?))(?:\/[A-Za-z0-9_.:[\]-]+)+)/gim)) {
    identifiers.push({ kind: 'route', value: match[1] })
  }

  for (const match of source.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    const identifier = { kind: 'symbol', value: match[1] || match[2] }
    if (isMeaningfulIdentifier(identifier)) identifiers.push(identifier)
  }

  return unique(identifiers)
}
