import { getCanonicalRuntimeTerminalHandle } from '~shared/runtime-terminal-pty-id'

export type AgentPaneAuthorityOwnershipSources = {
  getPtyIdForPaneKey?: (paneKey: string) => string | undefined
  getRuntimeTerminalHandleForPaneKey?: (paneKey: string) => string | undefined
}

export function createAgentPaneAuthorityOwnership(
  sources: AgentPaneAuthorityOwnershipSources
): (paneKey: string, ptyId: string) => boolean {
  return (paneKey, ptyId) => {
    if (sources.getPtyIdForPaneKey?.(paneKey) === ptyId) {
      return true
    }
    const runtimeHandle = sources.getRuntimeTerminalHandleForPaneKey?.(paneKey)
    return Boolean(runtimeHandle && getCanonicalRuntimeTerminalHandle(ptyId) === runtimeHandle)
  }
}
