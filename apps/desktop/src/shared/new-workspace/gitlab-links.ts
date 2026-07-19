import { isWorkItemLinkQueryTooLarge } from './work-item-link-query-bounds'

// GitLab project paths can contain nested groups and self-hosted domains. The
// project-internal `/-/` separator distinguishes merge-request URLs from other hosts.
const GL_MR_PATH_RE = /\/merge_requests\/(\d+)(?:\/.*)?$/i
const GL_MR_PATH_FULL_RE = /^\/(.+)\/-\/merge_requests\/(\d+)(?:\/.*)?$/i

export type ProjectSlug = {
  host: string
  path: string
}

export type GitLabMergeRequestQuery = {
  query: string
  directNumber: number | null
  tooLarge?: boolean
}

export function parseGitLabMergeRequestNumber(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const numeric = trimmed.startsWith('!') ? trimmed.slice(1) : trimmed
  if (/^\d+$/.test(numeric)) {
    return Number.parseInt(numeric, 10)
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (!url.pathname.includes('/-/')) {
    return null
  }
  const match = GL_MR_PATH_RE.exec(url.pathname)
  return match ? Number.parseInt(match[1], 10) : null
}

export function parseGitLabMergeRequestLink(input: string): {
  slug: ProjectSlug
  number: number
  type: 'mr'
} | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }

  const match = GL_MR_PATH_FULL_RE.exec(url.pathname)
  if (!match?.[1].includes('/')) {
    return null
  }
  return {
    slug: { host: url.host, path: match[1] },
    number: Number.parseInt(match[2], 10),
    type: 'mr'
  }
}

export function normalizeGitLabMergeRequestQuery(raw: string): GitLabMergeRequestQuery {
  if (isWorkItemLinkQueryTooLarge(raw)) {
    return { query: '', directNumber: null, tooLarge: true }
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return { query: '', directNumber: null }
  }
  return {
    query: trimmed,
    directNumber: parseGitLabMergeRequestNumber(trimmed)
  }
}
