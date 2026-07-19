import type { ClassifiedError } from '../../shared/types'

// Why: glab CLI surfaces API errors as unstructured stderr. Map known
// patterns to typed errors so callers can show user-friendly messages.
export function classifyGlabError(stderr: string): ClassifiedError {
  const s = stderr.toLowerCase()
  if (s.includes('http 403') || s.includes('forbidden') || s.includes('insufficient_scope')) {
    return {
      type: 'permission_denied',
      message: "You don't have permission to update this project. Check your GitLab token scopes."
    }
  }
  if (s.includes('http 404') || s.includes('project not found')) {
    return { type: 'not_found', message: 'GitLab resource not found.' }
  }
  if (s.includes('http 422') || s.includes('unprocessable')) {
    return { type: 'validation_error', message: `Invalid update — ${stderr.trim()}` }
  }
  if (s.includes('rate limit') || s.includes('http 429')) {
    return {
      type: 'rate_limited',
      message: 'GitLab rate limit hit. Try again in a few minutes.'
    }
  }
  if (
    s.includes('timeout') ||
    s.includes('no such host') ||
    s.includes('network') ||
    s.includes('could not resolve host')
  ) {
    return { type: 'network_error', message: 'Network error — check your connection.' }
  }
  return { type: 'unknown', message: `GitLab operation failed: ${stderr.trim()}` }
}

// Why: list failures need read-oriented copy rather than mutation wording.
export function classifyListError(stderr: string): ClassifiedError {
  const c = classifyGlabError(stderr)
  const trimmed = stderr.trim()
  const readMessages: Record<ClassifiedError['type'], string> = {
    permission_denied:
      "You don't have permission to read merge requests for this project. Check your GitLab token scopes.",
    not_found: 'Project not found.',
    validation_error: `Invalid request — ${trimmed}`,
    rate_limited: 'GitLab rate limit hit. Try again in a few minutes.',
    network_error: 'Network error — check your connection.',
    unknown: `Failed to load merge requests: ${trimmed}`
  }
  return { type: c.type, message: readMessages[c.type] }
}
