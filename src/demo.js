import { analyzeImpact, identifierKey } from './analyze.js'
import { normalizeDocument } from './documents.js'

export function createDemoGraph() {
  const changeSet = {
    base: 'HEAD~1',
    head: 'HEAD',
    fingerprint: 'truthdiff-demo-v1',
    files: [
      {
        path: 'src/routes.js',
        previousPath: 'src/routes.js',
        addedLines: ["export const active = '/api/v2/jobs'"],
        removedLines: ["export const retired = '/api/retired'"],
        addedIdentifiers: [{ kind: 'route', value: '/api/v2/jobs' }],
        removedIdentifiers: [
          { kind: 'route', value: '/api/retired' },
          { kind: 'symbol', value: 'retired' },
        ],
      },
      {
        path: 'src/billing.js',
        previousPath: 'src/billing.js',
        addedLines: ['export function scheduleRetry() {}'],
        removedLines: ['export function retryCharge() {}'],
        addedIdentifiers: [{ kind: 'symbol', value: 'scheduleRetry' }],
        removedIdentifiers: [{ kind: 'symbol', value: 'retryCharge' }],
      },
      {
        path: 'src/session-policy.js',
        previousPath: 'src/session-policy.js',
        addedLines: ['const sessionTtlMinutes = 30'],
        removedLines: ['const sessionTtlMinutes = 120'],
        addedIdentifiers: [],
        removedIdentifiers: [],
      },
    ],
  }

  const documents = [
    normalizeDocument({
      id: 'docs/deployment-runbook.md',
      title: 'Deployment runbook',
      content: '# Deployment\n\nSend the final job to `/api/retired`.',
      sourceRoot: 'operations',
      sourceName: 'Operations',
      sourceColor: '#a78bfa',
    }),
    normalizeDocument({
      id: 'docs/billing-recovery.md',
      title: 'Billing recovery',
      content: '# Billing recovery\n\nCall `retryCharge` after a provider timeout.',
      sourceRoot: 'engineering',
      sourceName: 'Engineering',
      sourceColor: '#38bdf8',
    }),
    normalizeDocument({
      id: 'docs/authentication.md',
      title: 'Authentication policy',
      content: '# Authentication\n\nOperator sessions remain valid for two hours.',
      sourceRoot: 'security',
      sourceName: 'Security',
      sourceColor: '#34d399',
    }),
    normalizeDocument({
      id: 'docs/brand-guide.md',
      title: 'Brand guide',
      content: '# Brand\n\nUse the primary blue for product marks.',
      sourceRoot: 'design',
      sourceName: 'Design',
      sourceColor: '#f472b6',
    }),
  ]

  return analyzeImpact({
    changeSet,
    documents,
    identifierStatus: {
      [identifierKey({ kind: 'route', value: '/api/retired' })]: 'absent',
    },
    semanticCandidates: [{
      sourceId: 'src/session-policy.js',
      documentId: 'docs/authentication.md',
      score: 0.91,
      snippet: 'Operator sessions remain valid for two hours.',
    }],
  })
}
