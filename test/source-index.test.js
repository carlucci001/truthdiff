import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildIdentifierStatus,
  removedVerifiableIdentifiers,
} from '../src/source-index.js';
import { identifierKey } from '../src/analyze.js';

test('marks identifiers absent only after scanning source files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'truthdiff-source-'));
  try {
    await mkdir(path.join(root, 'src'));
    await writeFile(
      path.join(root, 'src', 'routes.js'),
      "export const route = '/api/present';\n",
    );
    await writeFile(
      path.join(root, 'README.md'),
      'The old route was `/api/docs-only`.\n',
    );

    const status = await buildIdentifierStatus(root, [
      { kind: 'route', value: '/api/present' },
      { kind: 'route', value: '/api/docs-only' },
      { kind: 'config', value: 'MISSING_CONFIG' },
    ]);

    assert.deepEqual(status, {
      [identifierKey({ kind: 'route', value: '/api/present' })]: 'present',
      [identifierKey({ kind: 'route', value: '/api/docs-only' })]: 'absent',
      [identifierKey({ kind: 'config', value: 'MISSING_CONFIG' })]: 'absent',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('selects only removed identifiers eligible for deterministic verification', () => {
  const identifiers = removedVerifiableIdentifiers({
    files: [{
      removedIdentifiers: [
        { kind: 'route', value: '/api/removed' },
        { kind: 'config', value: 'REMOVED_KEY' },
        { kind: 'symbol', value: 'removedFunction' },
      ],
    }],
  });

  assert.deepEqual(identifiers.map(({ value }) => value), [
    '/api/removed',
    'REMOVED_KEY',
  ]);
});
