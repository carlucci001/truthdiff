const state = {
  token: '',
  graph: null,
  findings: [],
  nodes: [],
  edges: [],
  selectedId: null,
}

const $ = (selector) => document.querySelector(selector)
const elements = {
  form: $('#analyzeForm'),
  repo: $('#repoInput'),
  docs: $('#docsInput'),
  range: $('#rangeInput'),
  analyzeButton: $('#analyzeButton'),
  demoButton: $('#demoButton'),
  message: $('#formMessage'),
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
  elements.analyzeButton.disabled = busy
  elements.demoButton.disabled = busy
  elements.analyzeButton.querySelector('span').textContent = busy ? 'Analyzing…' : 'Run TruthDiff'
  elements.message.textContent = message
  elements.message.classList.remove('error')
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
  elements.changed.textContent = String(summary.changedFiles ?? 0)
  elements.contradicted.textContent = String(counts.contradicted ?? 0)
  elements.review.textContent = String(counts.review ?? 0)
  elements.affected.textContent = String(summary.affectedDocuments ?? 0)
}

function buildGraph(graph) {
  const width = elements.canvas.clientWidth || 800
  const height = elements.canvas.clientHeight || 470
  const sourceNodes = (graph.nodes || []).filter((node) => node.kind === 'source')
  const documentNodes = (graph.nodes || []).filter((node) => node.kind === 'document')

  state.nodes = [
    ...sourceNodes.map((node, index) => ({
      ...node,
      type: 'source',
      x: width * 0.23 + Math.cos(index * 2.2) * 45,
      y: height * (0.2 + ((index + 1) / (sourceNodes.length + 1)) * 0.62),
      vx: 0,
      vy: 0,
      radius: 10,
    })),
    ...documentNodes.map((node, index) => ({
      ...node,
      type: node.state === 'contradicted' ? 'contradicted' : 'review',
      x: width * 0.72 + Math.cos(index * 1.8) * 55,
      y: height * (0.2 + ((index + 1) / (documentNodes.length + 1)) * 0.62),
      vx: 0,
      vy: 0,
      radius: node.state === 'contradicted' ? 14 : 11,
    })),
  ]
  state.edges = graph.edges || []
}

function renderFindingList() {
  elements.findingList.replaceChildren()
  elements.findingTotal.textContent = String(state.findings.length)

  state.findings.forEach((finding) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `finding-item ${finding.state === 'contradicted' ? 'contradicted' : ''}`
    button.dataset.findingId = finding.id

    const dot = document.createElement('i')
    const title = document.createElement('span')
    title.textContent = basename(documentId(finding)).replace(/\.md$/i, '')
    const status = document.createElement('small')
    status.textContent = finding.state === 'contradicted' ? 'red' : 'review'
    button.append(dot, title, status)
    button.addEventListener('click', () => selectFinding(finding.id))
    elements.findingList.append(button)
  })
}

function selectFinding(id) {
  const finding = state.findings.find((item) => item.id === id)
  if (!finding) return

  state.selectedId = id
  const contradicted = finding.state === 'contradicted'
  elements.empty.hidden = true
  elements.detail.hidden = false
  elements.findingState.textContent = contradicted ? 'CONTRADICTED' : 'REVIEW'
  elements.findingState.classList.toggle('review', !contradicted)
  elements.findingTitle.textContent = basename(documentId(finding)).replace(/\.md$/i, '')
  elements.findingPath.textContent = documentId(finding)
  elements.findingReason.textContent = finding.reason || 'This document intersects with changed source evidence.'
  elements.findingSignal.textContent = signalText(finding)
  elements.findingSource.textContent = sourceId(finding)
  elements.findingEvidence.textContent = evidenceText(finding)
  elements.detail.querySelector('.proof-block').classList.toggle('review', !contradicted)

  for (const button of elements.findingList.querySelectorAll('.finding-item')) {
    button.classList.toggle('selected', button.dataset.findingId === id)
  }
}

function renderGraph(graph) {
  state.graph = graph
  state.findings = Array.isArray(graph.findings) ? graph.findings : []
  renderSummary(graph)
  buildGraph(graph)
  renderFindingList()

  const first = state.findings.find((finding) => finding.state === 'contradicted') || state.findings[0]
  if (first) selectFinding(first.id)
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

function simulate(width, height) {
  const nodeById = new Map(state.nodes.map((node) => [node.id, node]))

  for (let i = 0; i < state.nodes.length; i += 1) {
    for (let j = i + 1; j < state.nodes.length; j += 1) {
      const a = state.nodes[i]
      const b = state.nodes[j]
      const dx = a.x - b.x || 0.1
      const dy = a.y - b.y || 0.1
      const distanceSquared = Math.max(dx * dx + dy * dy, 100)
      const force = 130 / distanceSquared
      a.vx += dx * force
      a.vy += dy * force
      b.vx -= dx * force
      b.vy -= dy * force
    }
  }

  for (const edge of state.edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) continue
    const dx = target.x - source.x
    const dy = target.y - source.y
    const distance = Math.max(Math.hypot(dx, dy), 1)
    const force = (distance - 220) * 0.0007
    source.vx += dx * force
    source.vy += dy * force
    target.vx -= dx * force
    target.vy -= dy * force
  }

  state.nodes.forEach((node, index) => {
    const targetX = node.type === 'source' ? width * 0.24 : width * 0.72
    node.vx += (targetX - node.x) * 0.0008
    node.vx += Math.sin(performance.now() / 1700 + index) * 0.003
    node.vy += Math.cos(performance.now() / 2000 + index * 1.3) * 0.003
    node.vx *= 0.93
    node.vy *= 0.93
    node.x = Math.max(55, Math.min(width - 65, node.x + node.vx))
    node.y = Math.max(46, Math.min(height - 50, node.y + node.vy))
  })
}

function draw() {
  const { width, height, ratio } = sizeCanvas()
  const context = elements.canvas.getContext('2d')
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)
  simulate(width, height)

  const nodeById = new Map(state.nodes.map((node) => [node.id, node]))
  for (const edge of state.edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) continue
    const color = edge.state === 'contradicted' ? palette.contradicted : palette.review
    const gradient = context.createLinearGradient(source.x, source.y, target.x, target.y)
    gradient.addColorStop(0, 'rgba(58, 141, 246, 0.42)')
    gradient.addColorStop(1, edge.state === 'contradicted' ? 'rgba(255, 82, 104, 0.62)' : 'rgba(255, 186, 87, 0.52)')
    context.strokeStyle = gradient
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(source.x, source.y)
    context.lineTo(target.x, target.y)
    context.stroke()

    const pulse = (performance.now() / 1300 + target.x / 300) % 1
    context.fillStyle = color
    context.globalAlpha = 0.65
    context.beginPath()
    context.arc(source.x + (target.x - source.x) * pulse, source.y + (target.y - source.y) * pulse, 2, 0, Math.PI * 2)
    context.fill()
    context.globalAlpha = 1
  }

  for (const node of state.nodes) {
    const findingIds = state.edges
      .filter((edge) => edge.target === node.id)
      .flatMap((edge) => edge.findingIds || [])
    const selected = findingIds.includes(state.selectedId)
    const color = palette[node.type]
    context.shadowColor = color
    context.shadowBlur = selected ? 25 : 14
    context.fillStyle = color
    context.beginPath()
    context.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
    context.fill()
    context.shadowBlur = 0
    context.strokeStyle = selected ? '#e9fdff' : 'rgba(255,255,255,0.4)'
    context.lineWidth = selected ? 2 : 1
    context.beginPath()
    context.arc(node.x, node.y, node.radius + (selected ? 5 : 3), 0, Math.PI * 2)
    context.stroke()
    context.fillStyle = selected ? '#eefcff' : '#8fa5b3'
    context.font = `${selected ? 600 : 500} 10px Inter, system-ui, sans-serif`
    context.textAlign = 'center'
    context.fillText(node.name || basename(node.id), node.x, node.y + node.radius + 17)
  }

  requestAnimationFrame(draw)
}

async function loadDemo() {
  setBusy(true, 'Loading the built-in evidence demo…')
  try {
    renderGraph(await request('/api/demo'))
    setBusy(false, 'Safe demo loaded. Select any red or amber finding to inspect it.')
  } catch (error) {
    setBusy(false)
    elements.message.textContent = error.message
    elements.message.classList.add('error')
  }
}

async function analyze(event) {
  event.preventDefault()
  const repo = elements.repo.value.trim()
  const docs = elements.docs.value.trim()
  if (!repo || !docs) {
    elements.message.textContent = 'Enter both a local Git repository and Markdown folder.'
    elements.message.classList.add('error')
    return
  }

  setBusy(true, 'Analyzing the local Git diff and Markdown evidence…')
  try {
    const graph = await request('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ repo, docs, range: elements.range.value }),
    })
    renderGraph(graph)
    setBusy(false, `Analysis complete for ${repo}.`)
  } catch (error) {
    setBusy(false)
    elements.message.textContent = error.message
    elements.message.classList.add('error')
  }
}

elements.form.addEventListener('submit', analyze)
elements.demoButton.addEventListener('click', loadDemo)
elements.canvas.addEventListener('click', (event) => {
  const rect = elements.canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const hit = [...state.nodes].reverse().find((node) => node.kind === 'document' && Math.hypot(node.x - x, node.y - y) <= node.radius + 8)
  if (!hit) return
  const findingId = state.edges.find((edge) => edge.target === hit.id)?.findingIds?.[0]
  if (findingId) selectFinding(findingId)
})
window.addEventListener('resize', () => state.graph && buildGraph(state.graph))

async function boot() {
  try {
    const config = await request('/api/config')
    state.token = config.token
    await loadDemo()
    draw()
  } catch (error) {
    elements.message.textContent = `Preview failed to start: ${error.message}`
    elements.message.classList.add('error')
  }
}

boot()
