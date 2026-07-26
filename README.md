# TruthDiff

[![CI](https://github.com/carlucci001/truthdiff/actions/workflows/ci.yml/badge.svg)](https://github.com/carlucci001/truthdiff/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](https://nodejs.org/)

TruthDiff is a local-first, evidence-first engine that maps Git changes to the
documentation and operational knowledge they may invalidate.

It produces a graph that answers a practical question ordinary knowledge
graphs do not: **what knowledge became risky because the code changed?**

## What it ships

- An installable Node.js CLI (`truthdiff`)
- A zero-runtime-dependency JavaScript library
- A loopback-only animated preview with a built-in safe demo
- A versioned graph and findings contract for product integrations
- Deterministic red findings for provable contradictions
- Review-only semantic candidate support for vector indexes and AI systems
- A synthetic evidence-policy benchmark and Node test suite

## Quick start

```bash
npm install
npm test
node ./bin/truthdiff.js check --repo C:/dev/my-app --docs C:/dev/my-docs
```

Add `--json` to receive the machine-readable contract. The command exits with:

- `0` when no proven contradictions are found
- `1` when at least one deterministic contradiction is found
- `2` for usage or execution errors

## Standalone preview

Run the local visual shell:

```bash
npm run preview
```

Then open `http://127.0.0.1:4177`. The preview binds only to the loopback
interface, keeps repository paths and document content on the machine, and
loads a synthetic demo by default. Enter a local Git repository and Markdown
folder to replace the demo with a live working-tree analysis.

## Evidence policy

TruthDiff deliberately separates proof from inference.

| State | Meaning | Allowed source |
| --- | --- | --- |
| `contradicted` | A document cites a removed route or configuration key that is confirmed absent from current source | Deterministic evidence only |
| `review` | A changed symbol, path, or semantically related passage may need attention | Lexical or semantic evidence |
| `changed` | A code/source node changed | Git evidence |
| `verified` | Reserved for an explicit external verification adapter | Deterministic verifier |
| `unsupported` | Evidence cannot support a stronger classification | Any adapter |

Embeddings and language models may nominate candidates, but they can never
create a red `contradicted` finding.

## Library use

```js
import {
  analyzeImpact,
  buildIdentifierStatus,
  loadMarkdownDocuments,
  readGitChangeSet,
  removedVerifiableIdentifiers,
} from 'truthdiff'

const changeSet = readGitChangeSet({ repoPath: process.cwd(), base: 'HEAD' })
const documents = await loadMarkdownDocuments('./docs')
const identifierStatus = await buildIdentifierStatus(
  process.cwd(),
  removedVerifiableIdentifiers(changeSet),
)
const graph = analyzeImpact({ changeSet, documents, identifierStatus })
```

## Benchmark

```bash
npm run benchmark
```

The bundled benchmark is a synthetic conformance suite, not a claim about
real-world recall. It protects the product's most important promise: inferred
similarity cannot become a false red alert.

## Command Vault integration

The Farrington Command Center consumes this same package in its native Command
Vault `Impact` graph mode. Its existing FKL vector index supplies semantic
candidates, while TruthDiff owns classification and evidence.

TruthDiff does not upload repositories, require an account, or call a paid API.

## Status

TruthDiff is an alpha project at `0.1.0`. The API contract is versioned but may
evolve before `1.0`. Bug reports, evidence-policy test cases, and focused pull
requests are welcome.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidance and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

AGPL-3.0-only. See `LICENSE`.
