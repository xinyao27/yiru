export type AgentPaneAuthorityOwnershipSources = {
  getPtyIdForPaneKey?: (paneKey: string) => string | undefined
  getRuntimeTerminalHandleForPaneKey?: (paneKey: string) => string | undefined
}

function getRuntimeHandle(ptyId: string): string | null {
  if (!ptyId.startsWith('runtime:')) {
    return null
  }
  const rest = ptyId.slice(7)
  const separatorIndex = rest.indexOf('@@')
  if (separatorIndex === -1) {
    return rest.length > 0 && rest.trim() === rest ? rest : null
  }
  const encodedOwner = rest.slice(0, separatorIndex)
  const encodedHandle = rest.slice(separatorIndex + 2)
  if (!encodedOwner || !encodedHandle) {
    return null
  }
  try {
    const owner = decodeURIComponent(encodedOwner)
    const handle = decodeURIComponent(encodedHandle)
    if (!owner || owner.trim() !== owner || !handle || handle.trim() !== handle) {
      return null
    }
    return `runtime:${encodeURIComponent(owner)}@@${encodeURIComponent(handle)}` === ptyId
      ? handle
      : null
  } catch {
    return null
  }
}

export function createAgentPaneAuthorityOwnership(
  sources: AgentPaneAuthorityOwnershipSources
): (paneKey: string, ptyId: string) => boolean {
  return (paneKey, ptyId) => {
    if (sources.getPtyIdForPaneKey?.(paneKey) === ptyId) {
      return true
    }
    const runtimeHandle = sources.getRuntimeTerminalHandleForPaneKey?.(paneKey)
    return Boolean(runtimeHandle && getRuntimeHandle(ptyId) === runtimeHandle)
  }
}
