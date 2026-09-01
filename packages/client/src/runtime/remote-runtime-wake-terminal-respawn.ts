const wakeTerminalRespawnInFlightByWorktree = new Set<string>()

export function shouldSkipRemoteRuntimeWakeTerminalRespawn(worktreeId: string): boolean {
  return wakeTerminalRespawnInFlightByWorktree.has(worktreeId)
}

export function beginRemoteRuntimeWakeTerminalRespawn(worktreeId: string): boolean {
  if (wakeTerminalRespawnInFlightByWorktree.has(worktreeId)) {
    return false
  }
  wakeTerminalRespawnInFlightByWorktree.add(worktreeId)
  return true
}

export function endRemoteRuntimeWakeTerminalRespawn(worktreeId: string): void {
  wakeTerminalRespawnInFlightByWorktree.delete(worktreeId)
}

export function clearRemoteRuntimeWakeTerminalRespawnForWorktree(worktreeId: string): void {
  wakeTerminalRespawnInFlightByWorktree.delete(worktreeId)
}

export function clearAllRemoteRuntimeWakeTerminalRespawn(): void {
  wakeTerminalRespawnInFlightByWorktree.clear()
}
