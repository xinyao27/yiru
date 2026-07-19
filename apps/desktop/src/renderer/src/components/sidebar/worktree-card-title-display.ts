type WorktreeCardTitleDisplayInput = {
  storedDisplayName: string | null | undefined
  branchName: string | null | undefined
  reviewTitle?: string | null
}

function normalizeComparableTitle(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeTitle(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }
  if (/^(Loading .+|.+ details unavailable)$/i.test(trimmed)) {
    return null
  }
  return trimmed
}

function isBranchTitle(
  normalizedDisplayName: string | null,
  normalizedBranchName: string | null
): boolean {
  return normalizedDisplayName !== null && normalizedDisplayName === normalizedBranchName
}

export function coerceWorktreeCardVisibleTitle(value: string | null | undefined): string {
  // Why: older profiles can contain nullish titles; inline rename and hover
  // identity both require a stable string at this boundary.
  return typeof value === 'string' ? value : ''
}

export function getWorktreeCardTitleDisplay({
  storedDisplayName,
  branchName,
  reviewTitle
}: WorktreeCardTitleDisplayInput): string {
  const normalizedStoredDisplayName = normalizeComparableTitle(storedDisplayName)
  const normalizedBranchName = normalizeComparableTitle(branchName)
  const visibleStoredDisplayName = coerceWorktreeCardVisibleTitle(storedDisplayName)

  if (!normalizedBranchName) {
    return normalizedStoredDisplayName ? visibleStoredDisplayName : ''
  }

  if (
    normalizedStoredDisplayName &&
    !isBranchTitle(normalizedStoredDisplayName, normalizedBranchName)
  ) {
    return visibleStoredDisplayName
  }

  // Why: branch names are available in hover/details; the closed card title
  // should prefer a confirmed review subject, not repo/path guesses.
  return (
    normalizeTitle(reviewTitle) ?? (normalizedStoredDisplayName ? visibleStoredDisplayName : '')
  )
}
