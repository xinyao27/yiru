import type {
  BrowserAgentCommandResult,
  BrowserMouseClickResult
} from '@yiru/runtime-protocol/contract'
import { assertClipboardTextWriteWithinLimitWithYield } from '@yiru/workbench-model/ui'

import {
  cdpMouseButtonMask,
  cdpMouseModifierMask,
  normalizeCdpMouseButton
} from './agent-browser-bridge-command'
import {
  AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES,
  type BrowserMouseModifier
} from './agent-browser-bridge-input'
import { AgentBrowserBridgeNavigation } from './agent-browser-bridge-navigation'
import { resolveMobileTouchClickPoint } from './agent-browser-bridge-result'
import { BrowserError } from './cdp-bridge'
import { iterateBrowserTextInsertionChunks } from './text-insertion'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before

export abstract class AgentBrowserBridgeMouse extends AgentBrowserBridgeNavigation {
  async keyboardInsertText(
    text: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    await assertClipboardTextWriteWithinLimitWithYield(text)
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName) => {
        let result: BrowserAgentCommandResult = { inserted: true }
        for (const chunk of iterateBrowserTextInsertionChunks(
          text,
          AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES
        )) {
          result = (await this.execAgentBrowser(sessionName, [
            'keyboard',
            'inserttext',
            chunk
          ])) as BrowserAgentCommandResult
        }
        return result
      },
      { requireScopedTarget: true }
    )
  }

  // ── Mouse commands ──

  async mouseMove(
    x: number,
    y: number,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'mouse',
        'move',
        String(x),
        String(y)
      ])) as BrowserAgentCommandResult
    })
  }

  async mouseDown(
    button?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['mouse', 'down']
      if (button) {
        args.push(button)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  async mouseClick(
    x: number,
    y: number,
    button?: string,
    worktreeId?: string,
    browserPageId?: string,
    radius?: number,
    modifiers?: BrowserMouseModifier[]
  ): Promise<BrowserMouseClickResult> {
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (_sessionName, target) => {
        const page = this.browserPages.getPage(target.browserPageId)
        if (!page) {
          throw new BrowserError(
            'browser_tab_not_found',
            `Browser page ${target.browserPageId} is no longer available`
          )
        }
        const cdpButton = normalizeCdpMouseButton(button)
        const buttons = cdpMouseButtonMask(cdpButton)
        const cdpModifiers = cdpMouseModifierMask(modifiers)
        const lease = page.acquireCdp()
        try {
          await page.focus()
          const point =
            cdpButton === 'left'
              ? // Why: DOM activation cannot carry Cmd/Ctrl/Alt/Shift, so modifier
                // clicks use only the adjusted point and let CDP dispatch the event.
                await resolveMobileTouchClickPoint(lease, x, y, radius, cdpModifiers === 0)
              : { x, y, adjusted: false, handled: false }
          // Why: mobile taps should land as one atomic input operation. Sending
          // move/down/up through separate CLI calls visibly hovers targets and can
          // miss small controls before the click lands.
          // Runtime may already activate DOM controls because mobile-emulated
          // BrowserViews can ignore CDP mouse clicks for regular page taps.
          if (!point.handled) {
            await lease.sendCommand('Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x: point.x,
              y: point.y,
              button: cdpButton,
              buttons,
              modifiers: cdpModifiers,
              clickCount: 1
            })
            await lease.sendCommand('Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x: point.x,
              y: point.y,
              button: cdpButton,
              buttons: 0,
              modifiers: cdpModifiers,
              clickCount: 1
            })
          }
          return {
            clicked: {
              x: point.x,
              y: point.y,
              button: cdpButton,
              adjusted: point.adjusted,
              handled: point.handled
            }
          }
        } finally {
          lease.release()
        }
      },
      { ensureSession: false }
    )
  }
}
