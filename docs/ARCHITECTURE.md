# Architecture

TruthDiff has four deliberately separate layers:

1. `git.js` extracts changed files, lines, and identifiers from a Git diff.
2. `source-index.js` verifies whether removed routes and configuration keys
   still exist in the current source tree.
3. `analyze.js` joins source evidence to normalized documents and applies the
   evidence policy.
4. Product adapters may add semantic candidates, render the graph, or persist
   results without changing classification rules.

The core has no Command Center, Next.js, database, embedding, or model
dependency. Integrations pass plain objects into `analyzeImpact`.

## Graph contract

Every result contains:

- `schemaVersion`
- `fingerprint`
- `range`
- `nodes`
- `edges`
- `findings`
- `summary`

Findings carry their state, confidence, deterministic flag, and evidence. The
contract constructor rejects a `contradicted` finding unless it is explicitly
deterministic and contains evidence.

## Integration boundary

Vector databases are candidate generators. They answer, “what might be
related?” TruthDiff answers, “what does the available evidence justify?”

This boundary lets an integration replace its embedding model or vector store
without changing the red-alert safety policy.
