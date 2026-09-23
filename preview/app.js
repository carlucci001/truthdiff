const state = {
  token: '',
  sourceMode: 'local',
  sourceDrafts: {
    local: { repo: '', docs: '', range: 'working' },
    github: { repo: '', docs: '', range: 'last-commit' },
  },
  graph: null,
  findings: [],
  nodes: [],
  edges: [],
  selectedId: null,
  annotationSaved: false,
  runs: [],
  runsBusy: false,
  inspectingRunId: null,
}

const $ = (selector) => document.querySelector(selector)
const elements = {
  form: $('#analyzeForm'),
  repo: $('#repoInput'),
  repoLabel: $('#repoLabel'),
  repoHelp: $('#repoHelp'),
  docs: $('#docsInput'),
  docsLabel: $('#docsLabel'),
  docsHelp: $('#docsHelp'),
  range: $('#rangeInput'),
  rangeHelp: $('#rangeHelp'),
  analyzeButton: $('#analyzeButton'),
  demoButton: $('#demoButton'),
  message: $('#formMessage'),
  resultsPanel: $('#resultsPanel'),
  resultsContext: $('#resultsContext'),
  verdictCard: $('#verdictCard'),
  verdictSymbol: $('#verdictSymbol'),
  verdictKicker: $('#verdictKicker'),
  verdictTitle: $('#verdictTitle'),
  verdictText: $('#verdictText'),
  changed: $('#changedCount'),
  contradicted: $('#contradictedCount'),
  review: $('#reviewCount'),
  affected: $('#affectedCount'),
  canvas: $('#graphCanvas'),
  empty: $('#evidenceEmpty'),
  detail: $('#evidenceDetail'),
  findingState: $('#findingState'),
  findingTitle: $('#findingTitle'),
  findingPath: $('#findingPath'),
  findingReason: $('#findingReason'),
  findingSignal: $('#findingSignal'),
  findingSource: $('#findingSource'),
  findingEvidence: $('#findingEvidence'),
  findingTotal: $('#findingTotal'),
  findingList: $('#findingList'),
  findingsEmpty: $('#findingsEmpty'),
  quickAnnotateButton: $('#quickAnnotateButton'),
  annotationInput: $('#annotationInput'),
  annotationStatus: $('#annotationStatus'),
  saveAnnotationButton: $('#saveAnnotationButton'),
  refreshRunsButton: $('#refreshRunsButton'),
  runsPanel: $('#runsPanel'),
  runsLoading: $('#runsLoading'),
  runsMessage: $('#runsMessage'),
  runsList: $('#runsList'),
}

const palette = {
  source: '#3a8df6',
  contradicted: '#ff5268',
  review: '#ffba57',
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (state.token) headers.set('X-TruthDiff-Token', state.token)
  if (options.body) headers.set('Content-Type', 'application/json')

  const response = await fetch(path, { ...options, headers })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`)
  return payload
}

function setBusy(busy, message = '') {
  for (const control of elements.form.querySelectorAll('input[name="sourceMode"], #repoInput, #docsInput, #rangeInput')) {
    control.disabled = busy
  }
  elements.analyzeButton.disabled = busy
  elements.demoButton.disabled = busy
  elements.refreshRunsButton.disabled = busy || state.runsBusy
  elements.form.setAttribute('aria-busy', String(busy))
  elements.analyzeButton.querySelector('span').textContent = busy ? 'Checking…' : 'Check documentation'
  elements.message.textContent = message
  elements.message.classList.remove('error', 'success')
}

function setFormError(message, focusTarget) {
  elements.message.textContent = message
  elements.message.classList.remove('success')
  elements.message.classList.add('error')
  focusTarget?.focus()
}

const modeCopy = {
  local: {
    repoLabel: 'Local Git repository',
    repoPlaceholder: 'C:\\dev\\your-project',
    repoHelp: 'Use the full path to a checked-out Git repository.',
    docsLabel: 'Markdown documentation folder',
    docsPlaceholder: 'C:\\dev\\your-project\\docs',
    docsHelp: 'Use the full path to the folder containing .md files.',
    ranges: [
      ['working', 'Uncommitted work', 'Checks local edits that have not been committed yet.'],
      ['HEAD~1..HEAD', 'Most recent commit', 'Checks the newest local commit against the commit immediately before it.'],
      ['main..HEAD', 'Current branch since main', 'Checks commits on the current branch that are not on the local main branch.'],
    ],
  },
  github: {
    repoLabel: 'Public GitHub repository URL',
    repoPlaceholder: 'https://github.com/owner/repository',
    repoHelp: 'Use a public github.com repository URL. Private repositories are not supported in this MVP.',
    docsLabel: 'Docs path inside the repository',
    docsPlaceholder: 'docs',
    docsHelp: 'Use a repository-relative folder such as docs or content/guides, not a computer path.',
    ranges: [
      ['last-commit', 'Most recent commit', 'Checks the newest commit on the repository’s default branch against the commit before it.'],
    ],
  },
}

function setSourceMode(mode) {
  const nextMode = mode === 'github' ? 'github' : 'local'
  if (elements.repo && elements.docs && elements.range) {
    state.sourceDrafts[state.sourceMode] = {
      repo: elements.repo.value,
      docs: elements.docs.value,
      range: elements.range.value,
    }
  }
  state.sourceMode = nextMode
  const copy = modeCopy[state.sourceMode]
  const draft = state.sourceDrafts[state.sourceMode]
  elements.repoLabel.textContent = copy.repoLabel
  elements.repo.placeholder = copy.repoPlaceholder
  elements.repoHelp.textContent = copy.repoHelp
  elements.docsLabel.textContent = copy.docsLabel
  elements.docs.placeholder = copy.docsPlaceholder
  elements.docsHelp.textContent = copy.docsHelp
  elements.range.replaceChildren(...copy.ranges.map(([value, label]) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    return option
  }))
  elements.repo.value = draft.repo
  elements.docs.value = draft.docs
  if (copy.ranges.some(([value]) => value === draft.range)) elements.range.value = draft.range
  updateRangeHelp()
}

function updateRangeHelp() {
  const copy = modeCopy[state.sourceMode]
  const selected = copy.ranges.find(([value]) => value === elements.range.value) || copy.ranges[0]
  elements.rangeHelp.textContent = selected[2]
}

function basename(value = '') {
  return value.split(/[\\/]/).filter(Boolean).pop() || value || 'Untitled'
}

function documentId(finding) {
  return finding.documentId || finding.document || finding.target || 'Unknown document'
}

function sourceId(finding) {
  return finding.sourceId || finding.source || finding.changedFile || 'Changed source'
}

function evidenceText(finding) {
  const evidence = Array.isArray(finding.evidence) ? finding.evidence[0] : finding.evidence
  if (!evidence) return 'Derived from the current Git diff'
  if (typeof evidence === 'string') return evidence
  if (evidence.type === 'semantic') return `semantic score ${Number(evidence.score || 0).toFixed(2)}`
  const parts = [evidence.kind, evidence.value, evidence.change, evidence.currentStatus].filter(Boolean)
  return parts.join(' · ') || JSON.stringify(evidence)
}

function signalText(finding) {
  const evidence = Array.isArray(finding.evidence) ? finding.evidence[0] : finding.evidence
  if (!evidence) return finding.deterministic ? 'deterministic' : 'review'
  return `${evidence.type || 'impact'}${evidence.kind ? ` / ${evidence.kind}` : ''}`
}

function renderSummary(graph) {
  const summary = graph.summary || {}
  const counts = summary.counts || graph.counts || {}
  const changed = Number(summary.changedFiles ?? 0)
  const contradicted = Number(counts.contradicted ?? 0)
  const review = Number(counts.review ?? 0)
  const affected = Number(summary.affectedDocuments ?? 0)
  elements.changed.textContent = String(changed)
  elements.contradicted.textContent = String(contradicted)
  elements.review.textContent = String(review)
  elements.affected.textContent = String(affected)

  elements.verdictCard.classList.remove('critical', 'review', 'clear')
  if (contradicted > 0) {
    elements.verdictCard.classList.add('critical')
    elements.verdictSymbol.textContent = '!'
    elements.verdictKicker.textContent = 'ACTION NEEDED'
    elements.verdictTitle.textContent = `${contradicted} proven documentation ${contradicted === 1 ? 'mismatch' : 'mismatches'} found.`
    elements.verdictText.textContent = `TruthDiff found deterministic evidence that ${contradicted === 1 ? 'a document no longer agrees' : 'documents no longer agree'} with the changed code. Review the red ${contradicted === 1 ? 'finding' : 'findings'} first.`
  } else if (review > 0) {
    elements.verdictCard.classList.add('review')
    elements.verdictSymbol.textContent = '?'
    elements.verdictKicker.textContent = 'REVIEW SUGGESTED'
    elements.verdictTitle.textContent = 'No proven mismatch. Some documentation may need review.'
    elements.verdictText.textContent = `${review} ${review === 1 ? 'connection' : 'connections'} between changed code and documentation were found. These are clues, not claims that the documentation is wrong.`
  } else {
    elements.verdictCard.classList.add('clear')
    elements.verdictSymbol.textContent = '✓'
    elements.verdictKicker.textContent = 'NO IMPACT FOUND'
    elements.verdictTitle.textContent = changed > 0 ? 'No affected documentation was found.' : 'There were no code changes to check.'
    elements.verdictText.textContent = changed > 0
      ? 'TruthDiff did not connect this code change to any Markdown document in the selected folder.'
      : 'Choose a different code change range if you expected to see results.'
  }
}

function visibleColumnNodes(nodes, kind, limit = 7) {
  if (nodes.length <= limit) return nodes
  const hidden = nodes.length - (limit - 1)
  return [
    ...nodes.slice(0, limit - 1),
    {
      id: `truthdiff:${kind}:overflow`,
      kind,
      name: `+${hidden} more ${kind === 'source' ? 'changed files' : 'documents'}`,
      overflow: true,
    },
  ]
}

function columnY(index, total, height) {
  const top = 76
  const bottom = height - 42
  if (total <= 1) return (top + bottom) / 2
  return top + ((bottom - top) * index) / (total - 1)
}

function buildGraph(graph) {
  const width = elements.canvas.clientWidth || 800
  const height = elements.canvas.clientHeight || 470
  const sourceNodes = visibleColumnNodes(
    (graph.nodes || []).filter((node) => node.kind === 'source'),
    'source',
  )
  const documentNodes = visibleColumnNodes(
    (graph.nodes || []).filter((node) => node.kind === 'document'),
    'document',
  )
  const cardWidth = Math.max(145, Math.min(220, width * 0.36))
  const cardHeight = 48
  const sourceX = cardWidth / 2 + 24
  const documentX = width - cardWidth / 2 - 24

  state.nodes = [
    ...sourceNodes.map((node, index) => ({
      ...node,
      type: 'source',
      x: sourceX,
      y: columnY(index, sourceNodes.length, height),
      cardWidth,
      cardHeight,
    })),
    ...documentNodes.map((node, index) => ({
      ...node,
      type: node.state === 'contradicted' ? 'contradicted' : 'review',
      x: documentX,
      y: columnY(index, documentNodes.length, height),
      cardWidth,
      cardHeight,
    })),
  ]
  state.edges = graph.edges || []
}

function renderFindingList() {
  elements.findingList.replaceChildren()
  elements.findingTotal.textContent = String(state.findings.length)
  elements.findingsEmpty.hidden = state.findings.length > 0

  state.findings.forEach((finding) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `finding-item ${finding.state === 'contradicted' ? 'contradicted' : ''}`
    button.dataset.findingId = finding.id
    button.setAttribute('aria-pressed', 'false')

    const dot = document.createElement('i')
    const title = document.createElement('span')
    title.textContent = basename(documentId(finding)).replace(/\.md$/i, '')
    const status = document.createElement('small')
    status.textContent = finding.state === 'contradicted' ? 'proven' : 'review'
    button.append(dot, title, status)
    button.addEventListener('click', () => selectFinding(finding.id))
    elements.findingList.append(button)
  })
}

function selectedFinding() {
  return state.findings.find((item) => item.id === state.selectedId)
}

function annotationKey(finding) {
  return `truthdiff:annotation:${sourceId(finding)}:${documentId(finding)}`
}

function loadAnnotation(finding) {
  let annotation = ''
  try {
    annotation = window.localStorage.getItem(annotationKey(finding)) || ''
  } catch {
    annotation = ''
  }
  elements.annotationInput.value = annotation
  state.annotationSaved = Boolean(annotation)
  elements.annotationStatus.textContent = annotation ? 'Saved locally' : 'Not saved'
  elements.annotationStatus.classList.toggle('saved', Boolean(annotation))
  elements.quickAnnotateButton.textContent = annotation ? 'Edit annotation' : 'Quick annotate'
}

function openQuickAnnotation() {
  if (!selectedFinding()) return
  elements.annotationInput.focus()
}

function saveAnnotation() {
  const finding = selectedFinding()
  if (!finding) return

  const annotation = elements.annotationInput.value.trim()
  try {
    if (annotation) window.localStorage.setItem(annotationKey(finding), annotation)
    else window.localStorage.removeItem(annotationKey(finding))
  } catch {
    elements.annotationStatus.textContent = 'Could not save locally'
    elements.annotationStatus.classList.remove('saved')
    return
  }

  state.annotationSaved = Boolean(annotation)
  elements.annotationStatus.textContent = annotation ? 'Saved locally' : 'Cleared'
  elements.annotationStatus.classList.toggle('saved', Boolean(annotation))
  elements.quickAnnotateButton.textContent = annotation ? 'Edit annotation' : 'Quick annotate'
}

function selectFinding(id) {
  const finding = state.findings.find((item) => item.id === id)
  if (!finding) return

  state.selectedId = id
  const contradicted = finding.state === 'contradicted'
  elements.empty.hidden = true
  elements.detail.hidden = false
  elements.findingState.textContent = contradicted ? 'PROVEN MISMATCH' : 'REVIEW SUGGESTED'
  elements.findingState.classList.toggle('review', !contradicted)
  elements.findingTitle.textContent = basename(documentId(finding)).replace(/\.md$/i, '')
  elements.findingPath.textContent = documentId(finding)
  elements.findingReason.textContent = finding.reason || 'This document intersects with changed source evidence.'
  elements.findingSignal.textContent = signalText(finding)
  elements.findingSource.textContent = sourceId(finding)
  elements.findingEvidence.textContent = evidenceText(finding)
  elements.detail.querySelector('.proof-block').classList.toggle('review', !contradicted)
  elements.quickAnnotateButton.disabled = false
  loadAnnotation(finding)

  for (const button of elements.findingList.querySelectorAll('.finding-item')) {
    const selected = button.dataset.findingId === id
    button.classList.toggle('selected', selected)
    button.setAttribute('aria-pressed', String(selected))
  }
  draw()
}

function renderGraph(graph, context = 'Latest scan') {
  state.graph = graph
  state.findings = Array.isArray(graph.findings) ? graph.findings : []
  state.selectedId = null
  elements.resultsContext.textContent = context
  renderSummary(graph)
  buildGraph(graph)
  renderFindingList()
  elements.quickAnnotateButton.disabled = true
  elements.quickAnnotateButton.textContent = 'Select a document to annotate'
  elements.empty.hidden = false
  elements.detail.hidden = true
  elements.empty.querySelector('strong').textContent = state.findings.length ? 'Select a finding' : 'No evidence to inspect'
  elements.empty.querySelector('p').textContent = state.findings.length
    ? 'Choose a document to see the code connection and evidence.'
    : 'This scan did not produce any red or amber findings.'

  const first = state.findings.find((finding) => finding.state === 'contradicted') || state.findings[0]
  if (first) selectFinding(first.id)
  else draw()
}

function sizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const rect = elements.canvas.getBoundingClientRect()
  if (elements.canvas.width !== Math.floor(rect.width * ratio)) {
    elements.canvas.width = Math.floor(rect.width * ratio)
    elements.canvas.height = Math.floor(rect.height * ratio)
  }
  return { width: rect.width, height: rect.height, ratio }
}

function roundedRect(context, x, y, width, height, radius) {
  const right = x + width
  const bottom = y + height
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(right - radius, y)
  context.quadraticCurveTo(right, y, right, y + radius)
  context.lineTo(right, bottom - radius)
  context.quadraticCurveTo(right, bottom, right - radius, bottom)
  context.lineTo(x + radius, bottom)
  context.quadraticCurveTo(x, bottom, x, bottom - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

function clippedLabel(value, limit) {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function edgeLabel(edge) {
  const finding = state.findings.find((item) => edge.findingIds?.includes(item.id))
  const evidence = finding?.evidence?.[0]
  if (!evidence) return edge.state === 'contradicted' ? 'PROVEN MISMATCH' : 'REVIEW SIGNAL'
  if (evidence.type === 'semantic') {
    return `SEMANTIC · ${Math.round((evidence.score || 0) * 100)}%`
  }
  const status = evidence.currentStatus === 'absent' ? 'ABSENT' : 'CHANGED'
  return `${clippedLabel(evidence.value, 20)} · ${status}`
}

function draw() {
  const { width, height, ratio } = sizeCanvas()
  const context = elements.canvas.getContext('2d')
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)

  const nodeById = new Map(state.nodes.map((node) => [node.id, node]))
  const sourceColumn = state.nodes.find((node) => node.type === 'source')
  const documentColumn = state.nodes.find((node) => node.type !== 'source')
  context.font = '800 9px Inter, system-ui, sans-serif'
  context.fillStyle = '#637b8a'
  context.textAlign = 'left'
  if (sourceColumn) {
    context.fillText('CHANGED CODE', sourceColumn.x - sourceColumn.cardWidth / 2, 28)
  }
  if (documentColumn) {
    context.fillText('AFFECTED DOCUMENTATION', documentColumn.x - documentColumn.cardWidth / 2, 28)
  }

  for (const node of state.nodes.filter((item) => item.type !== 'source')) {
    const findingIds = state.edges
      .filter((edge) => edge.target === node.id)
      .flatMap((edge) => edge.findingIds || [])
    const selected = findingIds.includes(state.selectedId)
    roundedRect(context, 12, node.y - 34, width - 24, 68, 10)
    context.fillStyle = selected ? 'rgba(54, 215, 230, 0.055)' : 'rgba(113, 145, 164, 0.025)'
    context.fill()
    context.strokeStyle = selected ? 'rgba(54, 215, 230, 0.18)' : 'rgba(113, 145, 164, 0.06)'
    context.lineWidth = 1
    context.stroke()
  }

  for (const edge of state.edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) continue
    const color = edge.state === 'contradicted' ? palette.contradicted : palette.review
    const selected = edge.findingIds?.includes(state.selectedId)
    const startX = source.x + source.cardWidth / 2
    const endX = target.x - target.cardWidth / 2
    const curve = Math.max(42, (endX - startX) * 0.45)
    context.strokeStyle = edge.state === 'contradicted'
      ? `rgba(255, 82, 104, ${selected ? 0.95 : 0.68})`
      : `rgba(255, 186, 87, ${selected ? 0.92 : 0.58})`
    context.lineWidth = selected ? 3 : edge.state === 'contradicted' ? 2 : 1.5
    context.shadowColor = selected ? color : 'transparent'
    context.shadowBlur = selected ? 14 : 0
    context.beginPath()
    context.moveTo(startX, source.y)
    context.bezierCurveTo(startX + curve, source.y, endX - curve, target.y, endX, target.y)
    context.stroke()
    context.shadowBlur = 0

    context.fillStyle = color
    context.beginPath()
    context.moveTo(endX, target.y)
    context.lineTo(endX - 8, target.y - 5)
    context.lineTo(endX - 8, target.y + 5)
    context.closePath()
    context.fill()

    const label = edgeLabel(edge)
    context.font = '800 8px Inter, system-ui, sans-serif'
    const labelWidth = Math.min(150, Math.max(84, context.measureText(label).width + 20))
    const labelX = (startX + endX) / 2
    const labelY = (source.y + target.y) / 2
    roundedRect(context, labelX - labelWidth / 2, labelY - 12, labelWidth, 24, 12)
    context.fillStyle = selected ? 'rgba(10, 30, 40, 0.98)' : 'rgba(7, 18, 27, 0.94)'
    context.fill()
    context.strokeStyle = selected ? color : 'rgba(113, 145, 164, 0.22)'
    context.lineWidth = 1
    context.stroke()
    context.fillStyle = selected ? '#eefcff' : '#8fa5b3'
    context.textAlign = 'center'
    context.fillText(clippedLabel(label, 25), labelX, labelY + 3)
  }

  for (const node of state.nodes) {
    const findingIds = state.edges
      .filter((edge) => edge.target === node.id)
      .flatMap((edge) => edge.findingIds || [])
    const selected = findingIds.includes(state.selectedId)
    const color = palette[node.type]
    const left = node.x - node.cardWidth / 2
    const top = node.y - node.cardHeight / 2

    roundedRect(context, left, top, node.cardWidth, node.cardHeight, 8)
    context.fillStyle = node.type === 'source'
      ? 'rgba(58, 141, 246, 0.1)'
      : node.type === 'contradicted'
        ? 'rgba(255, 82, 104, 0.1)'
        : 'rgba(255, 186, 87, 0.09)'
    context.fill()
    context.strokeStyle = selected ? '#e9fdff' : color
    context.lineWidth = selected ? 2 : 1
    context.stroke()

    context.textAlign = 'left'
    context.fillStyle = color
    context.font = '800 8px Inter, system-ui, sans-serif'
    context.fillText(
      node.type === 'source'
        ? 'CHANGED'
        : node.type === 'contradicted'
          ? 'PROVEN WRONG'
          : 'REVIEW',
      left + 12,
      top + 16,
    )
    context.fillStyle = selected ? '#eefcff' : '#b7c7d2'
    context.font = `${selected ? 700 : 600} 11px Inter, system-ui, sans-serif`
    context.fillText(clippedLabel(node.name || basename(node.id), 28), left + 12, top + 34)
  }
}

function graphFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  if (payload.graph && typeof payload.graph === 'object') return payload.graph
  if (payload.result?.graph && typeof payload.result.graph === 'object') return payload.result.graph
  if (payload.result && (payload.result.nodes || payload.result.findings)) return payload.result
  if (payload.nodes || payload.findings) return payload
  return null
}

function runDate(value) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function runTitle(run) {
  const source = run?.source && typeof run.source === 'object' ? run.source : null
  const value = run.repo || run.repository || source?.repositoryUrl || source?.repositoryPath ||
    (source?.owner && source?.repository ? `${source.owner}/${source.repository}` : null) ||
    (typeof run.source === 'string' ? run.source : null) || 'Saved scan'
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname.replace(/^\//, '').replace(/\.git$/i, '') || value
    } catch {
      return value
    }
  }
  return basename(value)
}

function rangeLabel(value) {
  if (value && typeof value === 'object') value = value.range
  const labels = {
    working: 'Uncommitted work',
    'last-commit': 'Most recent commit',
    'HEAD~1..HEAD': 'Most recent commit',
    'main..HEAD': 'Current branch since main',
  }
  return labels[value] || value || 'Range unavailable'
}

function runReviewCount(run) {
  const graph = graphFromPayload(run)
  const summary = graph?.summary || run.summary || {}
  const counts = summary.counts || graph?.counts || run.counts || {}
  return Number(counts.contradicted || 0) + Number(counts.review || 0)
}

function renderRuns() {
  elements.runsList.replaceChildren()
  elements.runsMessage.classList.remove('error')
  if (!state.runs.length) {
    elements.runsMessage.textContent = 'No saved scans yet. Completed scans will appear here when history is available.'
    return
  }

  elements.runsMessage.textContent = ''
  state.runs.slice(0, 6).forEach((run, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'run-item'
    const title = document.createElement('strong')
    title.textContent = runTitle(run)
    const count = document.createElement('span')
    count.className = 'run-count'
    const findings = runReviewCount(run)
    count.textContent = `${findings} ${findings === 1 ? 'finding' : 'findings'}`
    const date = document.createElement('small')
    const dateText = runDate(run.createdAt || run.completedAt || run.timestamp)
    const rangeText = rangeLabel(run.range || run.diffRange || run.source?.comparison)
    date.textContent = `${rangeText} · ${dateText}`
    button.append(title, count, date)
    button.setAttribute('aria-label', `Open scan for repository ${title.textContent}, range ${rangeText}, ${dateText}, ${count.textContent}`)
    button.addEventListener('click', () => inspectRun(run, index))
    elements.runsList.append(button)
  })
}

async function inspectRun(run, index) {
  const runKey = String(run.id ?? index)
  if (state.inspectingRunId !== null || state.runsBusy) return
  state.inspectingRunId = runKey
  elements.runsList.setAttribute('aria-busy', 'true')
  for (const button of elements.runsList.querySelectorAll('button')) button.disabled = true
  elements.runsMessage.classList.remove('error')
  elements.runsMessage.textContent = `Opening saved scan for ${runTitle(run)}…`
  let graph = graphFromPayload(run)
  try {
    if (!graph && run.id != null) {
      const detail = await request(`/api/runs/${encodeURIComponent(run.id)}`)
      graph = graphFromPayload(detail)
    }
    if (!graph) throw new Error('This saved scan does not include an inspectable result.')
    const repository = runTitle(run)
    const range = rangeLabel(run.range || run.diffRange || run.source?.comparison)
    const date = runDate(run.createdAt || run.completedAt || run.timestamp)
    renderGraph(graph, `Saved scan · ${repository} · ${range} · ${date}`)
    elements.runsMessage.textContent = ''
    elements.message.textContent = `Opened recent scan ${index + 1}.`
    elements.message.classList.remove('error')
    elements.message.classList.add('success')
    elements.resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (error) {
    elements.runsMessage.textContent = error.message
    elements.runsMessage.classList.add('error')
  } finally {
    state.inspectingRunId = null
    elements.runsList.setAttribute('aria-busy', 'false')
    for (const button of elements.runsList.querySelectorAll('button')) button.disabled = false
  }
}

async function loadRuns() {
  if (state.runsBusy || state.inspectingRunId !== null) return
  state.runsBusy = true
  elements.runsPanel.setAttribute('aria-busy', 'true')
  elements.runsList.setAttribute('aria-busy', 'true')
  elements.refreshRunsButton.disabled = true
  elements.runsLoading.hidden = false
  elements.runsList.replaceChildren()
  elements.runsMessage.textContent = ''
  try {
    const payload = await request('/api/runs')
    const runs = Array.isArray(payload) ? payload : (payload.runs || payload.items || [])
    state.runs = Array.isArray(runs) ? runs : []
    renderRuns()
  } catch (error) {
    state.runs = []
    elements.runsMessage.textContent = error.message.includes('404')
      ? 'Scan history is not available in this preview yet.'
      : `Could not load scan history: ${error.message}`
    elements.runsMessage.classList.toggle('error', !error.message.includes('404'))
  } finally {
    state.runsBusy = false
    elements.runsPanel.setAttribute('aria-busy', 'false')
    elements.runsList.setAttribute('aria-busy', 'false')
    elements.refreshRunsButton.disabled = false
    elements.runsLoading.hidden = true
  }
}

async function loadDemo() {
  setBusy(true, 'Loading the built-in example…')
  try {
    renderGraph(await request('/api/demo'), 'Built-in example · no repository was scanned')
    setBusy(false, 'Example loaded. Select a finding to inspect its evidence.')
    elements.message.classList.add('success')
  } catch (error) {
    setBusy(false)
    setFormError(error.message)
  }
}

async function analyze(event) {
  event.preventDefault()
  const scan = {
    sourceMode: state.sourceMode,
    repo: elements.repo.value.trim(),
    docs: elements.docs.value.trim(),
    range: elements.range.value,
  }
  if (!scan.repo || !scan.docs) {
    setFormError(scan.sourceMode === 'github'
      ? 'Enter a public GitHub repository URL and its Markdown docs path.'
      : 'Enter both the local Git repository and Markdown folder paths.',
    !scan.repo ? elements.repo : elements.docs)
    return
  }

  if (scan.sourceMode === 'github' && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/i.test(scan.repo)) {
    setFormError('Use a full public repository URL such as https://github.com/owner/repository.', elements.repo)
    return
  }

  setBusy(true, scan.sourceMode === 'github'
    ? 'Reading the public repository and checking its documentation…'
    : 'Reading the local Git change and checking its documentation…')
  try {
    const payload = await request('/api/analyze', {
      method: 'POST',
      body: JSON.stringify(scan),
    })
    const graph = graphFromPayload(payload)
    if (!graph) throw new Error('The scan completed without a readable result graph.')
    renderGraph(graph, `${scan.sourceMode === 'github' ? 'Public GitHub' : 'Local checkout'} · ${runTitle(scan)} · ${rangeLabel(scan.range)}`)
    setBusy(false, `Documentation check complete for ${runTitle(scan)}.`)
    elements.message.classList.add('success')
    await loadRuns()
    elements.resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (error) {
    setBusy(false)
    setFormError(error.message)
  }
}

elements.form.addEventListener('submit', analyze)
elements.demoButton.addEventListener('click', loadDemo)
elements.refreshRunsButton.addEventListener('click', loadRuns)
elements.range.addEventListener('change', updateRangeHelp)
for (const input of document.querySelectorAll('input[name="sourceMode"]')) {
  input.addEventListener('change', () => {
    if (input.checked) setSourceMode(input.value)
  })
}
elements.quickAnnotateButton.addEventListener('click', openQuickAnnotation)
elements.saveAnnotationButton.addEventListener('click', saveAnnotation)
elements.annotationInput.addEventListener('input', () => {
  if (!state.annotationSaved) return
  state.annotationSaved = false
  elements.annotationStatus.textContent = 'Unsaved changes'
  elements.annotationStatus.classList.remove('saved')
})
elements.annotationInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    saveAnnotation()
  }
})
elements.canvas.addEventListener('click', (event) => {
  const rect = elements.canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const hit = [...state.nodes].reverse().find((node) => (
    node.kind === 'document'
    && !node.overflow
    && Math.abs(node.x - x) <= node.cardWidth / 2
    && Math.abs(node.y - y) <= node.cardHeight / 2
  ))
  if (!hit) return
  const findingId = state.edges.find((edge) => edge.target === hit.id)?.findingIds?.[0]
  if (findingId) selectFinding(findingId)
})
window.addEventListener('resize', () => {
  if (!state.graph) return
  buildGraph(state.graph)
  draw()
})

async function boot() {
  setSourceMode(document.querySelector('input[name="sourceMode"]:checked')?.value || 'local')
  try {
    const config = await request('/api/config')
    state.token = config.token
    await loadRuns()
    await loadDemo()
    draw()
  } catch (error) {
    elements.message.textContent = `Preview failed to start: ${error.message}`
    elements.message.classList.add('error')
  }
}

boot()
