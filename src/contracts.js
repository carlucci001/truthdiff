export const IMPACT_STATES = Object.freeze([
  'changed',
  'contradicted',
  'review',
  'verified',
  'unsupported',
])

export function createFinding(input) {
  const finding = {
    id: String(input.id || ''),
    state: String(input.state || ''),
    documentId: String(input.documentId || ''),
    sourceId: String(input.sourceId || ''),
    reason: String(input.reason || ''),
    confidence: Number(input.confidence ?? 0),
    deterministic: input.deterministic === true,
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
  }

  if (!finding.id) throw new Error('Finding id is required')
  if (!IMPACT_STATES.includes(finding.state)) {
    throw new Error(`Unsupported impact state: ${finding.state}`)
  }
  if (!finding.reason) throw new Error('Finding reason is required')
  if (finding.confidence < 0 || finding.confidence > 1) {
    throw new Error('Finding confidence must be between 0 and 1')
  }
  if (finding.state === 'contradicted' && !finding.deterministic) {
    throw new Error('Contradicted findings require deterministic evidence')
  }

  return finding
}

