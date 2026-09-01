import type { IDisposable } from '@xterm/xterm'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import { installMouseHideWhileTyping } from './mouse-hide-while-typing'
import type { PaneManager } from './pane-manager/pane-manager'
import { applyTerminalAppearance } from './terminal-appearance'
import { applyTerminalScrollbackRowsToMountedPanes } from './terminal-pane-lifecycle-decisions'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'

type TerminalPaneAppearanceInput = Pick<
  UseTerminalPaneLifecycleDeps,
  | 'effectiveMacOptionAsAlt'
  | 'effectiveMacOptionAsAltRef'
  | 'managerRef'
  | 'paneFontSizesRef'
  | 'paneLastThemeModeRef'
  | 'paneMode2031Ref'
  | 'paneTransportsRef'
  | 'settings'
  | 'settingsRef'
  | 'systemPrefersDark'
> & {
  mouseHideDisposablesRef: React.RefObject<Map<number, IDisposable>>
  terminalScrollbackRows: number
}

export function useTerminalPaneAppearance({
  effectiveMacOptionAsAlt,
  effectiveMacOptionAsAltRef,
  managerRef,
  mouseHideDisposablesRef,
  paneFontSizesRef,
  paneLastThemeModeRef,
  paneMode2031Ref,
  paneTransportsRef,
  settings,
  settingsRef,
  systemPrefersDark,
  terminalScrollbackRows
}: TerminalPaneAppearanceInput): (manager: PaneManager) => void {
  const systemPrefersDarkRef = useRef(systemPrefersDark)
  useLayoutEffect(() => {
    systemPrefersDarkRef.current = systemPrefersDark
  }, [systemPrefersDark])

  const applyAppearance = useEventCallback((manager: PaneManager): void => {
    const currentSettings = settingsRef.current
    if (!currentSettings) {
      return
    }
    applyTerminalAppearance(
      manager,
      currentSettings,
      systemPrefersDarkRef.current,
      paneFontSizesRef.current,
      paneTransportsRef.current,
      effectiveMacOptionAsAltRef.current,
      paneMode2031Ref.current,
      paneLastThemeModeRef.current
    )
  })

  useEffect(() => {
    const manager = managerRef.current
    if (!manager || !settings) {
      return
    }
    applyAppearance(manager)
  }, [applyAppearance, effectiveMacOptionAsAlt, managerRef, settings, systemPrefersDark])

  useEffect(() => {
    managerRef.current?.setTerminalGpuAcceleration(settings?.terminalGpuAcceleration ?? 'auto')
  }, [settings?.terminalGpuAcceleration, managerRef])

  useEffect(() => {
    const manager = managerRef.current
    if (manager) {
      applyTerminalScrollbackRowsToMountedPanes(manager, terminalScrollbackRows)
    }
  }, [managerRef, terminalScrollbackRows])

  useEffect(() => {
    const manager = managerRef.current
    if (!manager) {
      return
    }
    const hide = settings?.terminalMouseHideWhileTyping ?? false
    for (const pane of manager.getPanes()) {
      const existing = mouseHideDisposablesRef.current.get(pane.id)
      if (hide && !existing) {
        mouseHideDisposablesRef.current.set(
          pane.id,
          installMouseHideWhileTyping(pane.terminal, pane.container)
        )
      } else if (!hide && existing) {
        existing.dispose()
        mouseHideDisposablesRef.current.delete(pane.id)
      }
    }
  }, [managerRef, mouseHideDisposablesRef, settings?.terminalMouseHideWhileTyping])

  return applyAppearance
}
