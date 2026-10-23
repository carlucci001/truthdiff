import { execFile as execFileCallback } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

const CLONE_TIMEOUT_MS = 30_000
const GIT_OUTPUT_LIMIT = 1024 * 1024
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/
const GIT_COMMAND_CONFIG = Object.freeze([
  '-c', 'credential.helper=',
  '-c', 'protocol.allow=never',
  '-c', 'protocol.https.allow=always',
  '-c', 'filter.lfs.required=false',
  '-c', 'filter.lfs.smudge=',
  '-c', 'filter.lfs.process=',
])

function inside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function cloneError(error) {
  if (error?.killed || error?.code === 'ETIMEDOUT') {
    return new Error('GitHub clone timed out. Try a smaller public repository.')
  }
  return new Error('Unable to clone that public GitHub repository. Confirm that it exists and is public.')
}

function isolatedGitEnvironment(environment, homePath, configPath) {
  const clean = Object.fromEntries(
    Object.entries(environment || {}).filter(([key]) => !key.toUpperCase().startsWith('GIT_')),
  )
  return {
    ...clean,
    GCM_INTERACTIVE: 'Never',
    HOME: homePath,
    GIT_ASKPASS: '',
    GIT_CONFIG_GLOBAL: configPath,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: configPath,
    GIT_LFS_SKIP_SMUDGE: '1',
    GIT_PROTOCOL_FROM_USER: '0',
    GIT_TERMINAL_PROMPT: '0',
    USERPROFILE: homePath,
    XDG_CONFIG_HOME: homePath,
  }
}

export function isGitHubRepositoryUrl(value) {
  return /^https:\/\//i.test(String(value || '').trim())
}

export function parseGitHubRepositoryUrl(value) {
  const raw = String(value || '').trim()
  const authority = raw.match(/^https:\/\/([^/]+)/i)?.[1] || ''
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Enter a complete public GitHub HTTPS repository URL.')
  }

  if (
    url.protocol !== 'https:' ||
    authority.toLowerCase() !== 'github.com' ||
    url.hostname.toLowerCase() !== 'github.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Only public https://github.com/OWNER/REPOSITORY URLs are supported.')
  }

  const match = url.pathname.match(/^\/([^/]+)\/([^/]+?)\/?$/)
  if (!match) {
    throw new Error('GitHub URL must identify one repository: https://github.com/OWNER/REPOSITORY.')
  }

  const owner = match[1]
  const repository = match[2].replace(/\.git$/i, '')
  if (
    !OWNER_PATTERN.test(owner) ||
    !REPOSITORY_PATTERN.test(repository) ||
    repository === '.' ||
    repository === '..'
  ) {
    throw new Error('GitHub owner or repository name contains unsupported characters.')
  }

  return Object.freeze({
    owner,
    repository,
    cloneUrl: `https://github.com/${owner}/${repository}.git`,
    repositoryUrl: `https://github.com/${owner}/${repository}`,
  })
}

export function resolveRemoteDocsPath(repoPath, docsPath) {
  const requested = String(docsPath || '').trim()
  if (!requested) throw new Error('A Markdown folder inside the repository is required.')
  if (requested.includes('\0') || path.posix.isAbsolute(requested) || path.win32.isAbsolute(requested)) {
    throw new Error('For GitHub repositories, the Markdown folder must be a relative path inside the repository.')
  }
  if (requested.split(/[\\/]+/).includes('..')) {
    throw new Error('The Markdown folder cannot leave the cloned repository.')
  }

  const root = path.resolve(repoPath)
  const resolved = path.resolve(root, requested)
  if (!inside(root, resolved)) {
    throw new Error('The Markdown folder cannot leave the cloned repository.')
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Markdown folder was not found in the repository: ${requested}`)
  }

  const realRoot = fs.realpathSync(root)
  const realDocs = fs.realpathSync(resolved)
  if (!inside(realRoot, realDocs)) {
    throw new Error('The Markdown folder cannot resolve outside the cloned repository.')
  }
  if (!fs.statSync(realDocs).isDirectory()) {
    throw new Error(`Markdown path is not a folder: ${requested}`)
  }
  return realDocs
}

export async function withClonedGitHubRepository(value, operation, options = {}) {
  const repository = parseGitHubRepositoryUrl(value)
  const run = options.execFile || execFile
  const makeTemp = options.mkdtemp || fs.promises.mkdtemp
  const remove = options.rm || fs.promises.rm
  let tempRoot

  try {
    tempRoot = await makeTemp(path.join(options.tempRoot || os.tmpdir(), 'truthdiff-'))
    const checkoutPath = path.join(tempRoot, 'repository')
    const isolatedHome = path.join(tempRoot, 'home')
    await fs.promises.mkdir(isolatedHome)
    const isolatedConfig = path.join(isolatedHome, 'gitconfig')
    await fs.promises.writeFile(isolatedConfig, '')
    const executionOptions = {
      encoding: 'utf8',
      env: isolatedGitEnvironment(options.environment || process.env, isolatedHome, isolatedConfig),
      maxBuffer: GIT_OUTPUT_LIMIT,
      timeout: options.timeoutMs || CLONE_TIMEOUT_MS,
      windowsHide: true,
    }

    try {
      await run('git', [
        ...GIT_COMMAND_CONFIG,
        'clone',
        '--depth=2',
        '--single-branch',
        '--no-tags',
        '--',
        repository.cloneUrl,
        checkoutPath,
      ], executionOptions)
    } catch (error) {
      throw cloneError(error)
    }

    try {
      await run('git', [
        ...GIT_COMMAND_CONFIG,
        '-C',
        checkoutPath,
        'rev-parse',
        '--verify',
        'HEAD~1^{commit}',
      ], executionOptions)
    } catch {
      throw new Error('This repository needs at least two commits to compare the prior commit with HEAD.')
    }

    return await operation({ repoPath: checkoutPath, repository })
  } finally {
    if (tempRoot) await remove(tempRoot, { force: true, recursive: true })
  }
}
