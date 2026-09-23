import fs from 'node:fs/promises'

const envText = await fs.readFile('C:/dev/newsroomaios/.env.local', 'utf8')
const apiKey = envText.match(/^ELEVENLABS_API_KEY\s*=\s*['"]?([^\r\n'"]+)/m)?.[1]?.trim()
if (!apiKey) throw new Error('ElevenLabs API key is unavailable')

const narration = `Your code changed. Did your documentation keep up? TruthDiff connects code changes to the docs they may invalidate.

Start with the verdict. Red means a proven mismatch. Amber means review suggested.

See why it was flagged. This example identifies a removed API route still referenced by a runbook.

Related does not automatically mean wrong. Review suggestions stay separate from proven contradictions.

Follow the connections in the impact map. Inspect which changed files connect to affected documents.

TruthDiff. Code changes. Documentation checked. An open-source Farrington Development project. Try it on GitHub today.`

const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/cjVigY5qzO86Huf0OWal', {
  method: 'POST',
  headers: {
    'xi-api-key': apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: narration,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.62,
      similarity_boost: 0.78,
      style: 0.12,
      use_speaker_boost: true,
    },
  }),
})

if (!response.ok) throw new Error(`ElevenLabs request failed: ${response.status}`)
await fs.writeFile('C:/dev/truthdiff/output/playwright/truthdiff-demo/narration.mp3', Buffer.from(await response.arrayBuffer()))
console.log('Narration generated with Eric - Smooth, Trustworthy')
