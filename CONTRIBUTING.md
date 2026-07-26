# Contributing to TruthDiff

Thank you for helping make documentation impact analysis more trustworthy.

## Development setup

TruthDiff requires Node.js 20 or newer.

```bash
git clone https://github.com/carlucci001/truthdiff.git
cd truthdiff
npm ci
npm test
npm run benchmark
```

Run the local interface with:

```bash
npm run preview
```

## Evidence policy

TruthDiff deliberately separates proof from inference:

- A red contradiction must be supported by deterministic evidence.
- Semantic or similarity-based matches may nominate review candidates only.
- Unrelated documents should remain quiet.

Changes that weaken those guarantees must include focused tests and benchmark
cases explaining the new evidence boundary.

## Pull requests

Keep pull requests focused and include:

- what changed and why;
- user or developer impact;
- tests and benchmarks run;
- screenshots for interface changes.

By contributing, you agree that your contribution is licensed under the
project's AGPL-3.0-only license.
