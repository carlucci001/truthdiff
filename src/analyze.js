import crypto from 'node:crypto'
import path from 'node:path'
import { createFinding } from './contracts.js'
import { isMeaningfulIdentifier } from './identifiers.js'

const STATE_PRIORITY = {
  unsupported: 0,
  verified: 1,
  review: 2,
  changed: 3,
  contradicted: 4,
}

export function identifierKey(identifier) {
  return `${identifier.kind}\0${identifier.value}`
}

function findingId(parts) {
  return crypto.createHash('sha1').update(parts.join('\0')).digest('hex').slice(0, 16)
}

function documentMentions(document, value) {
  return document.content.includes(value)
}

function pathCandidates(file) {
  const filePath = String(file.path || '').replace(/\\/g, '/')
  const previousPath = String(file.previousPath || '').replace(/\\/g, '/')
  return [...new Set([
    filePath,
    previousPath,
    path.basename(filePath),
    path.basename(previousPath),
    path.basename(filePath, path.extname(filePath)),
    path.basename(previousPath, path.extname(previousPath)),
  ].filter(Boolean))]
}

function addFinding(findings, input) {
  const finding = createFinding({
    ...input,
    id: findingId([
      input.state,
      input.documentId,
      input.sourceId,
      input.reason,
    ]),
  })
  if (!findings.has(finding.id)) findings.set(finding.id, finding)
}

export function analyzeImpact(options = {}) {
  const changeSet = options.changeSet || { files: [], fingerprint: '' }
  const documents = Array.isArray(options.documents) ? options.documents : []
  const identifierStatus = options.identifierStatus || {}
  const semanticCandidates = Array.isArray(options.semanticCandidates)
    ? options.semanticCandidates
    : []
  const findings = new Map()

  for (const file of changeSet.files || []) {
    for (const document of documents) {
      for (const identifier of file.removedIdentifiers || []) {
        if (!isMeaningfulIdentifier(identifier)) continue
        if (!documentMentions(document, identifier.value)) continue
        const status = identifierStatus[identifierKey(identifier)] || 'unknown'
        const contradicted = status === 'absent' && ['config', 'route'].includes(identifier.kind)
        addFinding(findings, {
          state: contradicted ? 'contradicted' : 'review',
          documentId: document.id,
          sourceId: file.path,
          reason: contradicted
            ? `${identifier.kind} ${identifier.value} was removed and is absent from current source`
            : `${identifier.kind} ${identifier.value} changed and is referenced by this document`,
          confidence: contradicted ? 1 : 0.86,
          deterministic: true,
          evidence: [{
            type: 'identifier',
            kind: identifier.kind,
            value: identifier.value,
            sourcePath: file.path,
            change: 'removed',
            currentStatus: status,
          }],
        })
      }

      const pathMatch = pathCandidates(file).find(candidate => (
        candidate.includes('/') || candidate.includes('.')
      ) && documentMentions(document, candidate))
      if (pathMatch) {
        addFinding(findings, {
          state: 'review',
          documentId: document.id,
          sourceId: file.path,
          reason: `Changed source ${pathMatch} is referenced by this document`,
          confidence: 0.94,
          deterministic: true,
          evidence: [{
            type: 'source-path',
            value: pathMatch,
            sourcePath: file.path,
            change: file.status,
          }],
        })
      }
    }
  }

  for (const candidate of semanticCandidates) {
    if (!documents.some(document => document.id === candidate.documentId)) continue
    if (!(changeSet.files || []).some(file => file.path === candidate.sourceId)) continue
    addFinding(findings, {
      state: 'review',
      documentId: candidate.documentId,
      sourceId: candidate.sourceId,
      reason: candidate.reason || 'Semantic similarity suggests this document may be affected',
      confidence: Math.max(0, Math.min(0.79, Number(candidate.score || 0))),
      deterministic: false,
      evidence: [{
        type: 'semantic',
        score: Number(candidate.score || 0),
      }],
    })
  }

  const findingList = [...findings.values()]
  const nodeMap = new Map()
  const edgeMap = new Map()
  const documentById = new Map(documents.map(document => [document.id, document]))

  for (const file of changeSet.files || []) {
    nodeMap.set(file.path, {
      id: file.path,
      name: path.basename(file.path),
      kind: 'source',
      state: 'changed',
      links: 0,
    })
  }

  for (const finding of findingList) {
    const document = documentById.get(finding.documentId)
    const existing = nodeMap.get(finding.documentId)
    if (!existing || STATE_PRIORITY[finding.state] > STATE_PRIORITY[existing.state]) {
      nodeMap.set(finding.documentId, {
        id: finding.documentId,
        name: document?.title || path.basename(finding.documentId),
        kind: 'document',
        state: finding.state,
        links: existing?.links || 0,
        sourceRoot: document?.sourceRoot || '',
        sourceName: document?.sourceName || '',
        sourceColor: document?.sourceColor || '',
      })
    }
    const edgeKey = `${finding.sourceId}\0${finding.documentId}`
    const previous = edgeMap.get(edgeKey)
    if (!previous || STATE_PRIORITY[finding.state] > STATE_PRIORITY[previous.state]) {
      edgeMap.set(edgeKey, {
        source: finding.sourceId,
        target: finding.documentId,
        state: finding.state,
        findingIds: previous ? [...previous.findingIds, finding.id] : [finding.id],
      })
    } else {
      previous.findingIds.push(finding.id)
    }
  }

  for (const edge of edgeMap.values()) {
    const source = nodeMap.get(edge.source)
    const target = nodeMap.get(edge.target)
    if (source) source.links += 1
    if (target) target.links += 1
  }

  const counts = Object.fromEntries(Object.keys(STATE_PRIORITY).map(state => [
    state,
    findingList.filter(finding => finding.state === state).length,
  ]))

  return {
    schemaVersion: 1,
    fingerprint: changeSet.fingerprint || '',
    range: {
      base: changeSet.base || 'HEAD',
      head: changeSet.head || 'WORKTREE',
    },
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    findings: findingList,
    summary: {
      changedFiles: (changeSet.files || []).length,
      affectedDocuments: new Set(findingList.map(finding => finding.documentId)).size,
      findings: findingList.length,
      counts,
    },
  }
}
