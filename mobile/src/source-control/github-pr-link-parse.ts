// Parses a GitHub pull request reference from bare input or a repository URL.
const GH_PR_PATH_RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/i

export function parseGitHubPrReference(input: string): number | null {
  const trimmed = input.trim()
  const numeric = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
  if (/^\d+$/.test(numeric)) {
    const number = Number.parseInt(numeric, 10)
    return number > 0 ? number : null
  }
  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase()
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      (host !== 'github.com' && !host.endsWith('.github.com'))
    ) {
      return null
    }
    const match = GH_PR_PATH_RE.exec(url.pathname)
    return match ? Number.parseInt(match[3], 10) : null
  } catch {
    return null
  }
}
