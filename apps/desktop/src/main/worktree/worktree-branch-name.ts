import {
  assertBranchPrefixValid,
  normalizeBranchPrefix,
  selectBranchPrefixInput,
  type BranchPrefixSettings
} from '../../shared/branch-prefix'

/**
 * Resolve the branch prefix segment (the part before `/`) the configured
 * strategy will prepend, or null when no prefix applies. Exposed so callers can
 * detect a prefix the user already typed (or a generation model leaked) before
 * it gets prepended a second time.
 */
export function getConfiguredBranchPrefix(
  settings: BranchPrefixSettings,
  gitUsername: string | null
): string | null {
  const rawPrefix = selectBranchPrefixInput(settings, gitUsername)
  return rawPrefix ? normalizeBranchPrefix(rawPrefix) || null : null
}

/**
 * Compute the full branch name by applying the configured prefix strategy.
 */
export function computeBranchName(
  sanitizedName: string,
  settings: BranchPrefixSettings,
  gitUsername: string | null
): string {
  const prefix = getConfiguredBranchPrefix(settings, gitUsername)
  return prefix ? `${prefix}/${sanitizedName}` : sanitizedName
}

export function computeValidatedBranchName(
  sanitizedName: string,
  settings: BranchPrefixSettings,
  gitUsername: string | null
): string {
  const prefix = getConfiguredBranchPrefix(settings, gitUsername)
  if (prefix === null) {
    return sanitizedName
  }
  assertBranchPrefixValid(prefix)
  return `${prefix}/${sanitizedName}`
}
