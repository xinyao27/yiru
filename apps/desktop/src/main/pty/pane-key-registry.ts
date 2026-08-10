type PaneKeyBinding = {
  paneKey: string
  isOwner: boolean
}

const paneKeyByPtyId = new Map<string, string>()
const ptyIdByPaneKey = new Map<string, string>()

export function rememberPtyPaneKey(ptyId: string, paneKey: string): void {
  paneKeyByPtyId.set(ptyId, paneKey)
  ptyIdByPaneKey.set(paneKey, ptyId)
}

export function getPtyIdForPaneKey(paneKey: string): string | undefined {
  return ptyIdByPaneKey.get(paneKey)
}

export function getPaneKeyOwner(paneKey: string): string | undefined {
  return ptyIdByPaneKey.get(paneKey)
}

export function getPtyPaneKeyBinding(ptyId: string): PaneKeyBinding | null {
  const paneKey = paneKeyByPtyId.get(ptyId)
  if (!paneKey) {
    return null
  }
  return { paneKey, isOwner: ptyIdByPaneKey.get(paneKey) === ptyId }
}

export function forgetPtyPaneKey(ptyId: string, binding: PaneKeyBinding): void {
  if (binding.isOwner) {
    ptyIdByPaneKey.delete(binding.paneKey)
  }
  paneKeyByPtyId.delete(ptyId)
}
