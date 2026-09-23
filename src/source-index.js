import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { identifierKey } from './analyze.js';

const DEFAULT_EXCLUDED_DIRECTORIES = new Set([
  '.git', '.next', '.turbo', 'build', 'coverage', 'dist',
  'node_modules', 'out', 'public', 'vendor',
]);

const DEFAULT_SOURCE_EXTENSIONS = new Set([
  '.cjs', '.css', '.graphql', '.html', '.java', '.js', '.json', '.jsx',
  '.mjs', '.php', '.py', '.rb', '.rs', '.scss', '.sql', '.svelte',
  '.toml', '.ts', '.tsx', '.vue', '.yaml', '.yml',
]);
const DEFAULT_MAX_SOURCE_FILES = 20_000;
const DEFAULT_MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_SOURCE_BYTES = 100 * 1024 * 1024;

async function walkSourceFiles(
  rootPath,
  options,
  relativePath = '',
  state = { bytes: 0, files: [] },
) {
  const absolutePath = path.join(rootPath, relativePath);
  const entries = await readdir(absolutePath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (options.excludedDirectories.has(entry.name)) continue;
    const entryRelativePath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      await walkSourceFiles(rootPath, options, entryRelativePath, state);
      continue;
    }
    if (options.sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
      const file = await stat(path.join(rootPath, entryRelativePath));
      if (!file.isFile()) continue;
      if (file.size > options.maxFileBytes) {
        throw new Error(`Source file exceeds the ${options.maxFileBytes}-byte scan limit: ${entryRelativePath}`);
      }
      if (state.files.length >= options.maxFiles) {
        throw new Error(`Repository exceeds the ${options.maxFiles}-source-file scan limit.`);
      }
      if (state.bytes + file.size > options.maxBytes) {
        throw new Error(`Repository source exceeds the ${options.maxBytes}-byte scan limit.`);
      }
      state.bytes += file.size;
      state.files.push(entryRelativePath);
    }
  }

  return state.files;
}

export async function buildIdentifierStatus(repoPath, identifiers, options = {}) {
  const normalizedIdentifiers = identifiers
    .map((identifier) => typeof identifier === 'string'
      ? { key: identifier, value: identifier }
      : {
          key: identifierKey({
            kind: identifier?.kind || 'unknown',
            value: identifier?.value || '',
          }),
          value: identifier?.value,
        })
    .filter((identifier) => identifier.value);
  const uniqueIdentifiers = [
    ...new Map(normalizedIdentifiers.map((identifier) => [
      identifier.key,
      identifier,
    ])).values(),
  ];
  const status = Object.fromEntries(
    uniqueIdentifiers.map((identifier) => [identifier.key, 'absent']),
  );
  if (uniqueIdentifiers.length === 0) return status;

  const scanOptions = {
    excludedDirectories: new Set([
      ...DEFAULT_EXCLUDED_DIRECTORIES,
      ...(options.excludedDirectories || []),
    ]),
    sourceExtensions: new Set(
      options.sourceExtensions || DEFAULT_SOURCE_EXTENSIONS,
    ),
    maxFiles: Math.max(1, Number(options.maxFiles) || DEFAULT_MAX_SOURCE_FILES),
    maxFileBytes: Math.max(1, Number(options.maxFileBytes) || DEFAULT_MAX_SOURCE_FILE_BYTES),
    maxBytes: Math.max(1, Number(options.maxBytes) || DEFAULT_MAX_SOURCE_BYTES),
  };
  const files = await walkSourceFiles(path.resolve(repoPath), scanOptions);
  const unresolved = new Map(
    uniqueIdentifiers.map((identifier) => [identifier.key, identifier.value]),
  );

  for (const filePath of files) {
    if (unresolved.size === 0) break;
    let content;
    try {
      content = await readFile(path.join(repoPath, filePath), 'utf8');
    } catch {
      continue;
    }
    for (const [key, value] of unresolved) {
      if (content.includes(value)) {
        status[key] = 'present';
        unresolved.delete(key);
      }
    }
  }

  return status;
}

export function removedVerifiableIdentifiers(changeSet) {
  return (changeSet?.files || [])
    .flatMap((file) => file.removedIdentifiers || [])
    .filter((identifier) => (
      identifier?.kind === 'config' || identifier?.kind === 'route'
    ));
}
