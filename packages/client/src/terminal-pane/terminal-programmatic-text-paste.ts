import type { PasteTerminalTextDetail } from '~renderer/constants/terminal'
import { getConnectionId } from '~renderer/runtime/connection-context'
import type { PaneManager } from '~renderer/terminal-pane/pane-manager/pane-manager'
import { pasteTerminalText } from '~renderer/terminal/bracketed-paste'

import { executeTerminalPastePlan, planTerminalPasteWithYield } from './paste/coordinator'
import { resolveTerminalPasteRuntime } from './paste/runtime'
import { isTerminalPanePasteTargetCurrent } from './paste/target-state'
import type { PtyTransport } from './pty/transport-types'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import { writeTerminalPastePtyInput } from './terminal-pty-paste-writer'

type HandleTerminalProgrammaticTextPasteArgs = {
  detail: PasteTerminalTextDetail | undefined
  tabId: string
  worktreeId: string
  getManager: () => PaneManager | null
  getPaneTransports: () => Map<number, PtyTransport>
}

export function handleTerminalProgrammaticTextPaste({
  detail,
  tabId,
  worktreeId,
  getManager,
  getPaneTransports
}: HandleTerminalProgrammaticTextPasteArgs): void {
  if (!detail?.tabId || detail.tabId !== tabId || !detail.text) {
    return
  }
  const manager = getManager()
  if (!manager) {
    return
  }
  const panes = manager.getPanes()
  const pane =
    typeof detail.paneId === 'number'
      ? (panes.find((candidate) => candidate.id === detail.paneId) ?? null)
      : (manager.getActivePane() ?? panes[0])
  if (!pane) {
    return
  }
  const paneTransports = getPaneTransports()
  const transport = paneTransports.get(pane.id)
  const ptyId = transport?.getPtyId() ?? null
  const platform = getShortcutPlatform()
  const connectionId = getConnectionId(worktreeId) ?? null
  void planTerminalPasteWithYield({
    text: detail.text,
    source: 'programmatic',
    target: {
      kind: 'terminal',
      paneId: pane.id,
      leafId: pane.leafId,
      ptyId,
      runtime: resolveTerminalPasteRuntime({
        platform,
        ptyId,
        connectionId,
        transport
      })
    },
    terminalBracketedPasteMode: pane.terminal.modes?.bracketedPasteMode === true
  })
    .then((plan) =>
      executeTerminalPastePlan(plan, {
        pasteText: (text, options) => pasteTerminalText(pane.terminal, text, options),
        writePty: (data) => writeTerminalPastePtyInput(transport, data),
        isTargetCurrent: () =>
          isTerminalPanePasteTargetCurrent({
            manager: getManager(),
            paneTransports: getPaneTransports(),
            paneId: pane.id,
            leafId: pane.leafId,
            transport,
            ptyId
          }),
        canContinue: () =>
          isTerminalPanePasteTargetCurrent({
            manager: getManager(),
            paneTransports: getPaneTransports(),
            paneId: pane.id,
            leafId: pane.leafId,
            transport,
            ptyId
          })
      })
    )
    .then((result) => {
      if (result.status !== 'pasted') {
        return
      }
      recordTerminalUserInputForLeaf(tabId, pane.leafId)
      pane.terminal.focus()
    })
}

function getShortcutPlatform(userAgent = globalThis.navigator?.userAgent ?? ''): NodeJS.Platform {
  if (userAgent.includes('Mac')) {
    return 'darwin'
  }
  return userAgent.includes('Windows') ? 'win32' : 'linux'
}
