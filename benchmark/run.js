import { analyzeImpact, normalizeDocument } from '../src/index.js';
import { benchmarkCases } from './fixtures.js';

let relevantTruePositive = 0;
let relevantFalsePositive = 0;
let relevantFalseNegative = 0;
let expectedContradictions = 0;
let actualContradictions = 0;
let falseRed = 0;
const results = [];

for (const fixture of benchmarkCases) {
  const graph = analyzeImpact({
    changeSet: fixture.changeSet,
    documents: fixture.documents.map(normalizeDocument),
    identifierStatus: fixture.identifierStatus,
    semanticCandidates: fixture.semanticCandidates,
  });
  const expectedDocuments = new Set(fixture.expected.relevantDocuments);
  const actualDocuments = new Set(
    graph.findings.map((finding) => finding.documentId),
  );

  for (const documentId of actualDocuments) {
    if (expectedDocuments.has(documentId)) relevantTruePositive += 1;
    else relevantFalsePositive += 1;
  }
  for (const documentId of expectedDocuments) {
    if (!actualDocuments.has(documentId)) relevantFalseNegative += 1;
  }

  const contradicted = graph.summary.counts.contradicted;
  expectedContradictions += fixture.expected.contradicted;
  actualContradictions += contradicted;
  if (contradicted > fixture.expected.contradicted) {
    falseRed += contradicted - fixture.expected.contradicted;
  }
  results.push({
    name: fixture.name,
    expectedRelevant: expectedDocuments.size,
    actualRelevant: actualDocuments.size,
    expectedContradictions: fixture.expected.contradicted,
    actualContradictions: contradicted,
    pass: (
      expectedDocuments.size === actualDocuments.size
      && [...expectedDocuments].every((id) => actualDocuments.has(id))
      && contradicted === fixture.expected.contradicted
    ),
  });
}

const precision = relevantTruePositive
  / Math.max(1, relevantTruePositive + relevantFalsePositive);
const recall = relevantTruePositive
  / Math.max(1, relevantTruePositive + relevantFalseNegative);
const report = {
  benchmark: 'synthetic evidence-policy conformance',
  cases: benchmarkCases.length,
  passed: results.filter((result) => result.pass).length,
  relevantDocumentPrecision: Number(precision.toFixed(3)),
  relevantDocumentRecall: Number(recall.toFixed(3)),
  expectedContradictions,
  actualContradictions,
  falseRed,
  results,
};

console.log(JSON.stringify(report, null, 2));
if (report.passed !== report.cases || falseRed > 0) process.exitCode = 1;
