function stateIcon(state) {
  return {
    changed: '●',
    contradicted: '✕',
    review: '△',
    unsupported: '?',
    verified: '✓',
  }[state] || '•';
}

export function formatMarkdownReport(result) {
  const { summary, findings = [], range: analyzedRange = {} } = result;
  const range = analyzedRange.head === 'WORKTREE'
    ? `${analyzedRange.base || 'HEAD'} + working tree`
    : `${analyzedRange.base || 'HEAD'}..${analyzedRange.head || 'WORKTREE'}`;
  const lines = [
    '# TruthDiff impact report',
    '',
    `Range: \`${range}\``,
    `Changed files: ${summary.changedFiles}`,
    `Affected documents: ${summary.affectedDocuments}`,
    `Contradictions: ${summary.counts?.contradicted || 0}`,
    `Needs review: ${summary.counts?.review || 0}`,
    '',
  ];

  if (findings.length === 0) {
    lines.push('No affected documentation found.');
    return lines.join('\n');
  }

  for (const finding of findings) {
    lines.push(
      `## ${stateIcon(finding.state)} ${finding.state.toUpperCase()}: ${finding.documentId}`,
      '',
      finding.reason,
      '',
      `- Confidence: ${Math.round(finding.confidence * 100)}%`,
      `- Evidence: ${finding.evidence.map((item) => item.label || item.value || item.type).join('; ')}`,
      '',
    );
  }

  return lines.join('\n').trimEnd();
}
