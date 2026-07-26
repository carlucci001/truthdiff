import path from 'node:path';

import { analyzeImpact } from './analyze.js';
import { loadMarkdownDocuments } from './documents.js';
import { formatMarkdownReport } from './format.js';
import { readGitChangeSet } from './git.js';
import {
  buildIdentifierStatus,
  removedVerifiableIdentifiers,
} from './source-index.js';

export const HELP_TEXT = `TruthDiff — evidence-first code-to-documentation impact analysis

Usage:
  truthdiff check --repo <path> --docs <path> [options]

Options:
  --base <ref>     Base Git reference (default: HEAD)
  --head <ref>     Optional head Git reference; omit to include working changes
  --json           Emit the machine-readable graph and findings contract
  --help           Show this help
`;

export function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === '--help') {
    return { help: true };
  }
  const args = { command: argv[0] };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json' || argument === '--help') {
      args[argument.slice(2)] = true;
      continue;
    }
    if (argument.startsWith('--')) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}`);
      }
      args[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${argument}`);
  }
  return args;
}

export async function runCheck(options) {
  const repoPath = path.resolve(options.repo);
  const docsPath = path.resolve(options.docs);
  const changeSet = readGitChangeSet({
    repoPath,
    base: options.base || 'HEAD',
    head: options.head || null,
  });
  const documents = await loadMarkdownDocuments(docsPath);
  const verifiableIdentifiers = removedVerifiableIdentifiers(changeSet);
  const identifierStatus = await buildIdentifierStatus(
    repoPath,
    verifiableIdentifiers,
  );

  return analyzeImpact({
    changeSet,
    documents,
    identifierStatus,
  });
}

export async function runCli(argv, io = console) {
  let args;
  try {
    args = parseArguments(argv);
  } catch (error) {
    io.error(error.message);
    io.error(HELP_TEXT);
    return 2;
  }

  if (args.help || !args.command) {
    io.log(HELP_TEXT);
    return 0;
  }
  if (args.command !== 'check') {
    io.error(`Unknown command: ${args.command}`);
    io.error(HELP_TEXT);
    return 2;
  }
  if (!args.repo || !args.docs) {
    io.error('Both --repo and --docs are required.');
    io.error(HELP_TEXT);
    return 2;
  }

  try {
    const result = await runCheck(args);
    io.log(args.json
      ? JSON.stringify(result, null, 2)
      : formatMarkdownReport(result));
    return (result.summary.counts?.contradicted || 0) > 0 ? 1 : 0;
  } catch (error) {
    io.error(`TruthDiff failed: ${error.message}`);
    return 2;
  }
}
