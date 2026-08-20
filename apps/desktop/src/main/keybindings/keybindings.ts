import { shell } from 'electron'
import type { KeybindingActionId, KeybindingFileSnapshot } from '~shared/keybindings'

import { authorizeExternalPath } from '../filesystem/auth'
import { rebuildAppMenu } from '../menu/register-app-menu'
import { broadcastShellEvent } from '../shell/event-broadcast'
import type { KeybindingService } from './keybinding-service'

function broadcastKeybindingsChanged(snapshot: KeybindingFileSnapshot): void {
  broadcastShellEvent({ type: 'keybindingsChanged', snapshot })
  rebuildAppMenu()
}

type ShellKeybindingsService = ReturnType<typeof createShellKeybindingsService>

let shellKeybindingsService: ShellKeybindingsService | null = null

export function initializeShellKeybindingsService(service: KeybindingService): void {
  shellKeybindingsService = createShellKeybindingsService(service)
}

export function getShellKeybindingsService(): ShellKeybindingsService {
  if (!shellKeybindingsService) {
    throw new Error('shell_keybindings_service_unavailable')
  }
  return shellKeybindingsService
}

function createShellKeybindingsService(service: KeybindingService) {
  const ensureFile = (): KeybindingFileSnapshot => {
    const snapshot = service.ensureFile()
    // Why: keybindings.json lives in Yiru's app config directory, not inside a
    // workspace. Opening it in the editor still needs normal fs IPC access.
    authorizeExternalPath(snapshot.path)
    broadcastKeybindingsChanged(snapshot)
    return snapshot
  }

  const setAction = (args: {
    actionId: KeybindingActionId
    bindings: string[] | null
  }): KeybindingFileSnapshot => {
    const snapshot = service.setActionBindings(args.actionId, args.bindings)
    broadcastKeybindingsChanged(snapshot)
    return snapshot
  }

  const reload = (): KeybindingFileSnapshot => {
    const snapshot = service.reload()
    broadcastKeybindingsChanged(snapshot)
    return snapshot
  }

  const openFile = async (): Promise<KeybindingFileSnapshot> => {
    const snapshot = service.ensureFile()
    authorizeExternalPath(snapshot.path)
    const error = await shell.openPath(snapshot.path)
    if (error) {
      throw new Error(error)
    }
    return snapshot
  }

  const revealFile = (): KeybindingFileSnapshot => {
    const snapshot = service.ensureFile()
    authorizeExternalPath(snapshot.path)
    shell.showItemInFolder(snapshot.path)
    return snapshot
  }

  return {
    get: (): KeybindingFileSnapshot => service.getSnapshot(),
    ensureFile,
    setAction,
    reload,
    openFile,
    revealFile
  }
}
