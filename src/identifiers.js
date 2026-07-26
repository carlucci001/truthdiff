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

function unique(items) {
  const seen = new Set()
  return items.filter(item => {
    const key = `${item.kind}\0${item.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
    identifiers.push({ kind: 'symbol', value: match[1] || match[2] })
  }

  return unique(identifiers)
}

