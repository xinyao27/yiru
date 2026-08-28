import type { AppState } from '../../store/types'

export function collectWorktreePurgeTabPtyIds(
  state: AppState,
  doomedPtyIds: Set<string>,
  tabId: string,
  tabPtyId: string | null | undefined
): void {
  for (const ptyId of state.ptyIdsByTabId?.[tabId] ?? []) {
    doomedPtyIds.add(ptyId)
  }
  if (tabPtyId) {
    doomedPtyIds.add(tabPtyId)
  }
  const relayPtyId = state.lastKnownRelayPtyIdByTabId?.[tabId]
  if (relayPtyId) {
    doomedPtyIds.add(relayPtyId)
  }
  for (const ptyId of Object.values(state.terminalLayoutsByTabId?.[tabId]?.ptyIdsByLeafId ?? {})) {
    if (ptyId) {
      doomedPtyIds.add(ptyId)
    }
  }
}
