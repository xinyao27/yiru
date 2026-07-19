import type { ClassifiedError } from '../../shared/types'

// Why: gh CLI surfaces API errors as unstructured stderr. Map known
// patterns to typed errors so callers can show user-friendly messages.
export function classifyGhError(stderr: string): ClassifiedError {
  const s = stderr.toLowerCase()
  // Why: primary rate-limit errors also carry "HTTP 403" — check rate limit
  // first so they don't misclassify as a token-scope problem.
  if (s.includes('rate limit')) {
    return {
      type: 'rate_limited',
      message: 'GitHub rate limit hit. Try again in a few minutes.'
    }
  }
  if (s.includes('http 403') || s.includes('resource not accessible')) {
    return {
      type: 'permission_denied',
      message:
        "You don't have permission to perform this GitHub operation. Check your token scopes."
    }
  }
  if (s.includes('http 404') || s.includes('could not resolve to a repository')) {
    return { type: 'not_found', message: 'GitHub resource not found.' }
  }
  if (s.includes('http 422') || s.includes('validation failed')) {
    return { type: 'validation_error', message: `Invalid update — ${stderr.trim()}` }
  }
  if (
    s.includes('timeout') ||
    s.includes('no such host') ||
    s.includes('network') ||
    s.includes('could not resolve host')
  ) {
    return { type: 'network_error', message: 'Network error — check your connection.' }
  }
  return { type: 'unknown', message: `GitHub operation failed: ${stderr.trim()}` }
}
