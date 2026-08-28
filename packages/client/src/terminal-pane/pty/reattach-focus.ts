import type { Terminal } from '@xterm/xterm'

import {
  parsedViewportShowsParkedCursorAgentScreen,
  terminalHasFocusReportingEnabled
} from './cursor-agent-reattach'
import {
  CURSOR_SHOW_SEQUENCE,
  FOCUS_REPORTING_DISABLE_SEQUENCE,
  TERMINAL_FOCUS_IN_SEQUENCE
} from './terminal-output-policy'

type ReattachFocusOptions = {
  terminal: Terminal
  getIsDisposed: () => boolean
  getPtyId: () => string | null
  getStreamGeneration: () => number
  getSignalGeneration: () => number
  getHasCursorAgentSignal: () => boolean
  clearCursorAgentSignal: () => void
  hasLiveAgentSignal: () => boolean
  shouldSendFocusIn: () => boolean
  waitForOutputParsed: () => Promise<void>
  writeReplayData: (data: string) => void
  sendInput: (data: string) => void
}

export function createReattachFocusAfterReplay(options: ReattachFocusOptions) {
  return (
    expectedPtyId: string | null = options.getPtyId(),
    expectedStreamGeneration = options.getStreamGeneration()
  ): void => {
    const scheduledSignalGeneration = options.getSignalGeneration()
    void options.waitForOutputParsed().then(() => {
      if (
        options.getIsDisposed() ||
        expectedStreamGeneration !== options.getStreamGeneration() ||
        options.getPtyId() !== expectedPtyId ||
        scheduledSignalGeneration !== options.getSignalGeneration()
      ) {
        return
      }
      // Why: replay bytes can match a dead run still painted above a fresh
      // prompt. The parsed viewport is authoritative when status/title is absent.
      if (options.getHasCursorAgentSignal() && !options.hasLiveAgentSignal()) {
        if (parsedViewportShowsParkedCursorAgentScreen(options.terminal) === false) {
          options.clearCursorAgentSignal()
          options.writeReplayData(`${CURSOR_SHOW_SEQUENCE}${FOCUS_REPORTING_DISABLE_SEQUENCE}`)
          return
        }
      }
      if (options.shouldSendFocusIn() && terminalHasFocusReportingEnabled(options.terminal)) {
        options.sendInput(TERMINAL_FOCUS_IN_SEQUENCE)
      }
    })
  }
}
