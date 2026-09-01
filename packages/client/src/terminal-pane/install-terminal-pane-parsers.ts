import type { IDisposable } from '@xterm/xterm'

import { shellClient } from '../runtime/shell-client'
import { handleOsc52ClipboardRequest } from './osc52-clipboard'
import { showOsc52ClipboardBlockedToast } from './osc52-clipboard-blocked-toast'
import type { ManagedPane } from './pane-manager/pane-manager'
import { parseOsc7 } from './parse-osc7'
import { isPaneReplaying, type ReplayingPanesRef } from './replay-guard'
import type { PaneCwdMap } from './resolve-split-cwd'
import { installMode2031Handlers } from './terminal-appearance'
import { resolvePaneSeedCwd } from './terminal-pane-lifecycle-decisions'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'
import { guardParserHandler } from './terminal-parser-handler-guard'

type InstallTerminalPaneParsersInput = {
  defaultCwd: string
  mode2031Disposables: Map<number, IDisposable[]>
  osc52Disposables: Map<number, IDisposable>
  osc7Disposables: Map<number, IDisposable>
  osc7UncHost: string | null
  pane: ManagedPane
  paneCwdMap: PaneCwdMap
  paneLastThemeMode: Map<number, 'dark' | 'light'>
  paneMode2031: Map<number, boolean>
  replayingPanesRef: ReplayingPanesRef
  settingsRef: UseTerminalPaneLifecycleDeps['settingsRef']
  spawnCwd?: string
}

export function installTerminalPaneParsers({
  defaultCwd,
  mode2031Disposables,
  osc52Disposables,
  osc7Disposables,
  osc7UncHost,
  pane,
  paneCwdMap,
  paneLastThemeMode,
  paneMode2031,
  replayingPanesRef,
  settingsRef,
  spawnCwd
}: InstallTerminalPaneParsersInput): void {
  mode2031Disposables.set(
    pane.id,
    installMode2031Handlers({
      paneId: pane.id,
      parser: pane.terminal.parser,
      onSubscribe: () => {},
      isReplaying: () => isPaneReplaying(replayingPanesRef, pane.id),
      paneMode2031,
      paneLastThemeMode
    })
  )

  osc52Disposables.set(
    pane.id,
    pane.terminal.parser.registerOscHandler(
      52,
      guardParserHandler('osc-52-clipboard', (data) =>
        handleOsc52ClipboardRequest(data, {
          allowClipboardWrite: settingsRef.current?.terminalAllowOsc52Clipboard === true,
          writeClipboardText: shellClient.ui.writeClipboardText,
          onBlockedWrite: showOsc52ClipboardBlockedToast
        })
      )
    )
  )

  if (!paneCwdMap.has(pane.id)) {
    paneCwdMap.set(pane.id, {
      cwd: resolvePaneSeedCwd(spawnCwd, defaultCwd),
      confirmed: false
    })
  }
  osc7Disposables.set(
    pane.id,
    pane.terminal.parser.registerOscHandler(
      7,
      guardParserHandler('osc-7-cwd', (data) => {
        const parsedCwd = parseOsc7(data, { uncHost: osc7UncHost })
        if (parsedCwd) {
          paneCwdMap.set(pane.id, {
            cwd: parsedCwd,
            confirmed: !isPaneReplaying(replayingPanesRef, pane.id)
          })
        }
        return true
      })
    )
  )
}
