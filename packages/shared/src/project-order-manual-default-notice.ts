export function isExistingPersistedProfile(args: {
  repoCount: number
  onboardingClosedAt: number | null | undefined
  ui: unknown
}): boolean {
  return (
    args.repoCount > 0 ||
    args.onboardingClosedAt != null ||
    (args.ui != null && typeof args.ui === 'object' && Object.keys(args.ui).length > 0)
  )
}
