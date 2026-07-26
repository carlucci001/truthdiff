import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.js';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

test('CLI emits a deterministic contradiction and exits one', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'truthdiff-cli-'));
  const repo = path.join(root, 'repo');
  const docs = path.join(root, 'docs');
  try {
    await mkdir(repo);
    await mkdir(docs);
    git(repo, ['init']);
    git(repo, ['config', 'user.email', 'truthdiff@example.test']);
    git(repo, ['config', 'user.name', 'TruthDiff Test']);
    await writeFile(
      path.join(repo, 'routes.js'),
      "export const retired = '/api/retired';\n",
    );
    git(repo, ['add', 'routes.js']);
    git(repo, ['commit', '-m', 'baseline']);
    await writeFile(path.join(repo, 'routes.js'), 'export const active = true;\n');
    await writeFile(
      path.join(docs, 'integration.md'),
      'Send requests to `/api/retired` to complete the operation.\n',
    );

    const stdout = [];
    const stderr = [];
    const exitCode = await runCli([
      'check',
      '--repo', repo,
      '--docs', docs,
      '--json',
    ], {
      log: (value) => stdout.push(value),
      error: (value) => stderr.push(value),
    });

    assert.equal(exitCode, 1);
    assert.equal(stderr.length, 0);
    const report = JSON.parse(stdout.join('\n'));
    assert.equal(report.summary.counts.contradicted, 1);
    assert.equal(report.findings[0].deterministic, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI help is available without repository access', async () => {
  const stdout = [];
  const exitCode = await runCli(['--help'], {
    log: (value) => stdout.push(value),
    error: () => {},
  });
  assert.equal(exitCode, 0);
  assert.match(stdout.join('\n'), /evidence-first/);
});
