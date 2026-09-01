const authoritativeRuntimePtyIds = new Set<string>()

export function synchronizeTerminalProviderSnapshotCapabilities(
  livePtyIds: readonly string[]
): void {
  authoritativeRuntimePtyIds.clear()
  for (const ptyId of livePtyIds) {
    if (ptyId.length > 0) {
      authoritativeRuntimePtyIds.add(ptyId)
    }
  }
}

export function terminalProviderHasAuthoritativeSnapshot(ptyId: string): boolean {
  return authoritativeRuntimePtyIds.has(ptyId)
}
