import { getConnectionId } from '~renderer/runtime/connection-context'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import type { ManagedPane, PaneManager } from '~renderer/terminal-pane/pane-manager/pane-manager'
import { pasteTerminalText } from '~renderer/terminal/bracketed-paste'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import {
  executeTerminalPastePlan,
  planTerminalPasteWithYield,
  type TerminalPasteSource,
  type TerminalPasteTextOptions
} from './paste/coordinator'
import { formatTerminalPasteExecutionError } from './paste/errors'
import { resolveTerminalPasteRuntime } from './paste/runtime'
import { isTerminalPanePasteTargetCurrent } from './paste/target-state'
import type { PtyTransport } from './pty/transport-types'
import { pasteTerminalClipboard } from './terminal-clipboard-paste'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import { writeTerminalPastePtyInput } from './terminal-pty-paste-writer'
import { scheduleImagePasteWebglAtlasRecovery } from './terminal-webgl-atlas-recovery'

type TerminalContextMenuPasteInput = {
  forceBracketedMultilineTextPaste: boolean
  managerRef: React.RefObject<PaneManager | null>
  onPasteError: (message: string) => void
  pane: ManagedPane
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  source: Extract<TerminalPasteSource, 'context-menu' | 'right-click'>
  tabId: string
  worktreeId: string
}

function getShortcutPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
}

export async function pasteFromTerminalContextMenu({
  forceBracketedMultilineTextPaste,
  managerRef,
  onPasteError,
  pane,
  paneTransportsRef,
  source,
  tabId,
  worktreeId
}: TerminalContextMenuPasteInput): Promise<void> {
  const connectionId = getConnectionId(worktreeId) ?? null
  const transport = paneTransportsRef.current.get(pane.id)
  const ptyId = transport?.getPtyId() ?? null
  const isTargetCurrent = (): boolean =>
    isTerminalPanePasteTargetCurrent({
      manager: managerRef.current,
      paneTransports: paneTransportsRef.current,
      paneId: pane.id,
      leafId: pane.leafId,
      transport,
      ptyId
    })

  const pasteText = async (text: string, options?: TerminalPasteTextOptions): Promise<boolean> => {
    const plan = await planTerminalPasteWithYield({
      text,
      source,
      target: {
        kind: 'terminal',
        paneId: pane.id,
        leafId: pane.leafId,
        ptyId,
        runtime: resolveTerminalPasteRuntime({
          platform: getShortcutPlatform(),
          ptyId,
          connectionId,
          transport,
          isWindowsConpty: forceBracketedMultilineTextPaste
        })
      },
      forceBracketedPaste: options?.forceBracketedPaste,
      forceBracketedPasteForMultiline: options?.forceBracketedPasteForMultiline,
      terminalBracketedPasteMode: pane.terminal.modes.bracketedPasteMode
    })
    const execution = await executeTerminalPastePlan(plan, {
      pasteText: (value, pasteOptions) => pasteTerminalText(pane.terminal, value, pasteOptions),
      writePty: (data) => writeTerminalPastePtyInput(transport, data),
      isTargetCurrent,
      canContinue: isTargetCurrent
    })
    if (execution.status !== 'pasted') {
      onPasteError(formatTerminalPasteExecutionError(execution.reason))
      return false
    }
    if (text) {
      recordTerminalUserInputForLeaf(tabId, pane.leafId)
    }
    if (options?.recoverImagePasteWebglAtlas) {
      scheduleImagePasteWebglAtlasRecovery()
    }
    return true
  }

  const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(
    useAppStore.getState(),
    worktreeId
  )
  const result = await pasteTerminalClipboard({
    readClipboardText: shellClient.ui.readClipboardText,
    saveClipboardImageAsTempFile: shellClient.ui.saveClipboardImageAsTempFile,
    connectionId,
    runtimeEnvironmentId,
    forceBracketedMultilineTextPaste,
    pasteText,
    onTextPasteError: () =>
      onPasteError('Paste failed: clipboard text is too large for a safe terminal paste.'),
    onImagePasteError: (error) => {
      const detail = error instanceof Error ? error.message : String(error)
      onPasteError(`Image paste failed: ${detail}`)
    }
  })
  // Why: rejected async targets must not steal focus from the user's new
  // control, while a completed paste should return input to xterm.
  if (result.status === 'pasted') {
    pane.terminal.focus()
  }
}
