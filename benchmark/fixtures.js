export const benchmarkCases = [
  {
    name: 'removed route absent from current source',
    changeSet: {
      files: [{
        path: 'src/routes.js',
        addedIdentifiers: [],
        removedIdentifiers: [{ kind: 'route', value: '/api/retired' }],
      }],
    },
    documents: [{
      id: 'docs/integration.md',
      content: 'POST to `/api/retired` to submit the job.',
    }],
    identifierStatus: { 'route\0/api/retired': 'absent' },
    expected: { relevantDocuments: ['docs/integration.md'], contradicted: 1 },
  },
  {
    name: 'moved configuration key remains in source',
    changeSet: {
      files: [{
        path: 'src/config.js',
        addedIdentifiers: [],
        removedIdentifiers: [{ kind: 'config', value: 'ACTIVE_REGION' }],
      }],
    },
    documents: [{
      id: 'docs/configuration.md',
      content: 'Set `ACTIVE_REGION` before startup.',
    }],
    identifierStatus: { 'config\0ACTIVE_REGION': 'present' },
    expected: { relevantDocuments: ['docs/configuration.md'], contradicted: 0 },
  },
  {
    name: 'removed symbol is review-only',
    changeSet: {
      files: [{
        path: 'src/client.js',
        addedIdentifiers: [],
        removedIdentifiers: [{ kind: 'symbol', value: 'openSession' }],
      }],
    },
    documents: [{
      id: 'docs/sdk.md',
      content: 'Call `openSession` to initialize the SDK.',
    }],
    identifierStatus: {},
    expected: { relevantDocuments: ['docs/sdk.md'], contradicted: 0 },
  },
  {
    name: 'semantic candidate is review-only',
    changeSet: {
      files: [{
        path: 'src/billing.js',
        addedIdentifiers: [],
        removedIdentifiers: [],
      }],
    },
    documents: [{
      id: 'docs/payments.md',
      content: 'Payment retries are queued for later processing.',
    }],
    identifierStatus: {},
    semanticCandidates: [{
      sourceId: 'src/billing.js',
      documentId: 'docs/payments.md',
      score: 0.93,
      snippet: 'Payment retries are queued.',
    }],
    expected: { relevantDocuments: ['docs/payments.md'], contradicted: 0 },
  },
  {
    name: 'unrelated document remains quiet',
    changeSet: {
      files: [{
        path: 'src/auth.js',
        addedIdentifiers: [{ kind: 'symbol', value: 'rotateToken' }],
        removedIdentifiers: [],
      }],
    },
    documents: [{
      id: 'docs/recipes.md',
      content: 'This guide explains how to make bread.',
    }],
    identifierStatus: {},
    expected: { relevantDocuments: [], contradicted: 0 },
  },
];
