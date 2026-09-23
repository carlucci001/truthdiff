import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
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

test('ignores source symlink files and directories outside the repository', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'truthdiff-source-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'truthdiff-source-outside-'));
  try {
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'safe.js'), 'export const safe = true;\n');
    await writeFile(path.join(outside, 'external.js'), "export const route = '/api/external-only';\n");
    try {
      await symlink(path.join(outside, 'external.js'), path.join(root, 'src', 'linked.js'), 'file');
      await symlink(outside, path.join(root, 'linked-directory'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (error.code === 'EPERM') return t.skip('File symlinks require elevated permission on this Windows host');
      throw error;
    }

    const key = identifierKey({ kind: 'route', value: '/api/external-only' });
    const status = await buildIdentifierStatus(root, [
      { kind: 'route', value: '/api/external-only' },
    ]);
    assert.equal(status[key], 'absent');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('enforces source file scan budgets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'truthdiff-source-limit-'));
  try {
    await writeFile(path.join(root, 'large.js'), 'export const value = true;\n');
    await assert.rejects(
      buildIdentifierStatus(root, [{ kind: 'config', value: 'MISSING_KEY' }], {
        maxFileBytes: 4,
      }),
      /scan limit/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
