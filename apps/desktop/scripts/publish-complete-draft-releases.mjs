#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const API_VERSION = '2026-03-10'
const RELEASE_CUT_AUTHOR = 'github-actions[bot]'
const DESKTOP_RC_TAG_PATTERN = /^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$/
const WINDOWS_RELEASE_ASSET_NAMES = [
  'latest.yml',
  'yiru-windows-setup.exe',
  'yiru-windows-setup.exe.blockmap'
]

export function readWindowsReleaseEnabled(env = process.env) {
  const value = env.YIRU_WINDOWS_RELEASE_ENABLED
  if (value == null || value.trim().length === 0) {
    return true
  }
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  throw new Error('YIRU_WINDOWS_RELEASE_ENABLED must be "true" or "false"')
}

export function isReleaseCutDraft(release) {
  return (
    release?.draft === true &&
    release?.author?.login === RELEASE_CUT_AUTHOR &&
    typeof release?.tag_name === 'string' &&
    DESKTOP_RC_TAG_PATTERN.test(release.tag_name)
  )
}

function isRcTag(tag) {
  return tag.includes('-rc.')
}

function gitOutput(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim()
}

export function isTagBuiltFromCurrentRef(tag, { cwd = process.cwd() } = {}) {
  try {
    const tagCommit = gitOutput(['rev-parse', `${tag}^{}`], cwd)
    const currentCommit = gitOutput(['rev-parse', 'HEAD'], cwd)
    if (tagCommit === currentCommit) {
      return true
    }

    return gitOutput(['rev-parse', `${tagCommit}^`], cwd) === currentCommit
  } catch {
    return false
  }
}

async function githubRequest(fetchImpl, url, token, options = {}) {
  const res = await fetchImpl(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      ...options.headers
    }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GitHub request failed ${res.status} ${res.statusText}: ${body.slice(0, 300)}`)
  }
  return res
}

async function githubJson(fetchImpl, url, token, options = {}) {
  const res = await githubRequest(fetchImpl, url, token, options)
  return res.json()
}

async function fetchReleases(repo, token, fetchImpl) {
  const releases = await githubJson(
    fetchImpl,
    `https://api.github.com/repos/${repo}/releases?per_page=100`,
    token
  )
  if (!Array.isArray(releases)) {
    throw new Error(`GitHub releases response for ${repo} was not an array`)
  }
  return releases
}

export async function deleteWindowsReleaseAssets({ repo, release, token, fetchImpl = fetch }) {
  const windowsNames = new Set(WINDOWS_RELEASE_ASSET_NAMES)
  const assets = Array.isArray(release?.assets) ? release.assets : []
  const deleted = []

  for (const asset of assets) {
    if (!windowsNames.has(asset.name)) {
      continue
    }
    await githubRequest(
      fetchImpl,
      `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`,
      token,
      { method: 'DELETE' }
    )
    deleted.push(asset.name)
  }

  return deleted
}

export async function deleteWindowsReleaseAssetsForTag({ repo, tag, token, fetchImpl = fetch }) {
  if (!repo) {
    throw new Error('repo is required')
  }
  if (!tag) {
    throw new Error('tag is required')
  }
  if (!token) {
    throw new Error('token is required')
  }

  const releases = await fetchReleases(repo, token, fetchImpl)
  const release = releases.find((candidate) => candidate.tag_name === tag)
  if (!release) {
    throw new Error(`Release ${repo}@${tag} was not found in the draft-aware releases list`)
  }
  if (release.draft !== true) {
    throw new Error(`Release ${repo}@${tag} is not a draft; refusing to delete assets`)
  }

  return deleteWindowsReleaseAssets({ repo, release, token, fetchImpl })
}

export async function publishCompleteDraftReleases({
  repo,
  token,
  includeWindows = true,
  fetchImpl = fetch,
  removeWindowsReleaseAssets = deleteWindowsReleaseAssets,
  isDraftBuiltFromCurrentRef = ({ tag }) => isTagBuiltFromCurrentRef(tag),
  log = console.log
}) {
  if (!repo) {
    throw new Error('repo is required')
  }
  if (!token) {
    throw new Error('token is required')
  }

  const releases = await fetchReleases(repo, token, fetchImpl)
  const candidates = releases
    .filter(isReleaseCutDraft)
    .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())

  const published = []
  const skipped = []

  for (const release of candidates) {
    const tag = release.tag_name
    if (!(await isDraftBuiltFromCurrentRef({ tag, release }))) {
      const reason = 'tag is not built from the current release ref'
      skipped.push({ tag, reason })
      log(`Skipping stale RC draft release ${tag}: ${reason}`)
      continue
    }

    if (!includeWindows) {
      // Why: release retries reuse bot-authored drafts, so stale Windows
      // artifacts must be removed before a macOS/Linux-only draft is exposed.
      const removed = await removeWindowsReleaseAssets({ repo, release, token, fetchImpl })
      if (removed.length > 0) {
        log(`Removed disabled Windows assets from RC draft ${tag}: ${removed.join(', ')}`)
      }
    }

    // Why: workflow dependencies finish the release-cut build jobs before this
    // resume path publishes their bot-authored drafts.
    await githubJson(
      fetchImpl,
      `https://api.github.com/repos/${repo}/releases/${release.id}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({
          draft: false,
          prerelease: isRcTag(tag)
        })
      }
    )
    published.push(tag)
    log(`Published RC draft release ${tag}`)
  }

  if (published.length === 0 && skipped.length === 0) {
    log('No release-cut RC drafts to publish.')
  }

  return { published, skipped }
}

export function writeGithubOutputs({ published, skipped }, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return
  }
  appendFileSync(
    outputPath,
    `${[
      `published_count=${published.length}`,
      `skipped_count=${skipped.length}`,
      `latest_published_tag=${published.at(-1) ?? ''}`,
      `published_tags=${published.join(',')}`,
      `skipped_tags=${skipped.map((item) => item.tag).join(',')}`
    ].join('\n')}\n`
  )
}

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY || 'xinyao27/yiru'
  const [command, tag] = process.argv.slice(2)

  if (command === 'remove-windows-assets') {
    if (!tag) {
      throw new Error('Usage: publish-complete-draft-releases.mjs remove-windows-assets <tag>')
    }
    const deleted = await deleteWindowsReleaseAssetsForTag({ repo, tag, token })
    if (deleted.length > 0) {
      console.log(`Removed disabled Windows assets from ${repo}@${tag}: ${deleted.join(', ')}`)
    }
    return
  }
  if (command) {
    throw new Error(`Unknown command: ${command}`)
  }

  const includeWindows = readWindowsReleaseEnabled()
  const result = await publishCompleteDraftReleases({ repo, token, includeWindows })
  writeGithubOutputs(result)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
