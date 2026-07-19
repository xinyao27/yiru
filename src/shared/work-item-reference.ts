// Why: a single, host-aware parser for the PR or MR named in a prompt,
// shared by the sidebar workspace name and the tab
// title so both surface the same identifier. URLs are validated by *path
// structure* (owner/repo/pull/N, GitLab's `/-/` marker) rather than hostname,
// which keeps GitHub Enterprise and self-hosted GitLab working while rejecting
// stray URLs that merely contain `/pull/<n>` (CDN assets, docs pages).

export type WorkIdentifier = {
  /** Human label, identifier-first, e.g. `PR 1033` or `MR 42`. */
  label: string
  /** Lowercased identifier tokens, so consumers can drop them from a slug or
   *  description rather than echoing `Pr`, a bare number, or the review number twice. */
  tokens: string[]
}

// Prompts can be paste-sized, and a review target is named up front — so bound
// the scan to a prefix rather than running regexes over the whole prompt.
const IDENTIFIER_SCAN_LIMIT = 4096

const URL_IN_TEXT = /https?:\/\/[^\s<>()[\]"']+/gi
// GitLab's project-internal `/-/` marker is unambiguous, so ordering GitLab first is safe.
const GITLAB_ITEM_PATH = /\/-\/merge_requests\/(\d+)(?:[/?#]|$)/i
const GITHUB_ITEM_PATH = /^\/[^/]+\/[^/]+\/pull\/(\d+)(?:[/?#]|$)/i
// Bitbucket Cloud: /workspace/repo/pull-requests/N
const BITBUCKET_CLOUD_ITEM_PATH = /^\/[^/]+\/[^/]+\/pull-requests\/(\d+)(?:[/?#]|$)/i
// Bitbucket Server / Data Center nests the repo under a project or user, so the
// PR path carries more segments than Cloud: /projects/KEY/repos/REPO/pull-requests/N.
const BITBUCKET_SERVER_ITEM_PATH =
  /\/(?:projects|users)\/[^/]+\/repos\/[^/]+\/pull-requests\/(\d+)(?:[/?#]|$)/i
// Azure DevOps (dev.azure.com, *.visualstudio.com, on-prem collections) always
// routes a PR through /_git/REPO/pullrequest/N, regardless of org/project prefix.
const AZURE_DEVOPS_ITEM_PATH = /\/_git\/[^/]+\/pullrequests?\/(\d+)(?:[/?#]|$)/i

function taggedIdentifier(type: 'PR' | 'MR', num: string): WorkIdentifier {
  return { label: `${type} ${num}`, tokens: [type.toLowerCase(), num] }
}

function urlToIdentifier(raw: string): WorkIdentifier | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }
  const path = url.pathname
  const gitlab = GITLAB_ITEM_PATH.exec(path)
  if (gitlab) {
    return taggedIdentifier('MR', gitlab[1])
  }
  const github = GITHUB_ITEM_PATH.exec(path)
  if (github) {
    return taggedIdentifier('PR', github[1])
  }
  const bitbucketCloud = BITBUCKET_CLOUD_ITEM_PATH.exec(path)
  if (bitbucketCloud) {
    return taggedIdentifier('PR', bitbucketCloud[1])
  }
  const bitbucketServer = BITBUCKET_SERVER_ITEM_PATH.exec(path)
  if (bitbucketServer) {
    return taggedIdentifier('PR', bitbucketServer[1])
  }
  const azureDevops = AZURE_DEVOPS_ITEM_PATH.exec(path)
  if (azureDevops) {
    return taggedIdentifier('PR', azureDevops[1])
  }
  return null
}

function findUrlIdentifier(text: string): WorkIdentifier | null {
  const urls = text.match(URL_IN_TEXT)
  if (!urls) {
    return null
  }
  for (const raw of urls) {
    // Trim trailing sentence punctuation and markdown emphasis (`_`/`*`/`~`): a
    // URL wrapped like `_…/pull/5_` otherwise keeps the `_`, breaking the path
    // anchor so the identifier is lost. Interior `_` (`merge_requests`) is kept.
    const identifier = urlToIdentifier(raw.replace(/[.,;:!?*_~]+$/, ''))
    if (identifier) {
      return identifier
    }
  }
  return null
}

/**
 * Pull the review-target identifier out of raw prompt text. Precedence runs from
 * most reliable (provider URLs) to least (a bare `#123`), so a real URL wins over incidental numeric text. Returns null when the prompt names none.
 */
export function extractWorkIdentifier(text: string): WorkIdentifier | null {
  const scanned = text.slice(0, IDENTIFIER_SCAN_LIMIT)

  const urlIdentifier = findUrlIdentifier(scanned)
  if (urlIdentifier) {
    return urlIdentifier
  }

  // Textual references ("pull request #12", "PR 12", "MR !4").
  let match = scanned.match(/\bmerge\s+request\s*[#!]?\s*(\d+)/i)
  if (match) {
    return taggedIdentifier('MR', match[1])
  }
  match = scanned.match(/\bpull\s+request\s*#?\s*(\d+)/i) ?? scanned.match(/\bpr\s*#?\s*(\d+)/i)
  if (match) {
    return taggedIdentifier('PR', match[1])
  }

  return null
}

/**
 * Compose an identifier-first label — `PR 1033 - Review`, or just `PR 1033` when
 * there is no trailing detail. The single source of the format shared by the
 * sidebar name, tab title, and auto-rename name so they cannot drift apart.
 */
export function formatIdentifierFirst(label: string, detail: string): string {
  return detail ? `${label} - ${detail}` : label
}

/**
 * Remove the identifier's own tokens from a description so a caller can prepend
 * the label without echoing it — `PR 1094 - Review this PR` becomes
 * `PR 1094 - Review this`.
 */
export function stripWorkIdentifierEcho(text: string, identifier: WorkIdentifier): string {
  let stripped = text
  for (const token of identifier.tokens) {
    stripped = stripped.replace(new RegExp(`\\b${token}\\b`, 'gi'), ' ')
  }
  return stripped.replace(/\s+/g, ' ').trim()
}
