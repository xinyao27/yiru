export function resolveDiagnosticYiruChannel(): 'stable' | 'rc' | 'dev' {
  const identity =
    typeof YIRU_BUILD_IDENTITY !== 'undefined'
      ? YIRU_BUILD_IDENTITY
      : ((globalThis as { YIRU_BUILD_IDENTITY?: 'stable' | 'rc' | null }).YIRU_BUILD_IDENTITY ??
        null)
  return identity === 'stable' || identity === 'rc' ? identity : 'dev'
}
