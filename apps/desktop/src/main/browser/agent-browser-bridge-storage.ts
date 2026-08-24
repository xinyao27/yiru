import type { BrowserAgentCommandResult } from '@yiru/runtime-protocol/contract'
import { assertClipboardTextWriteWithinLimitWithYield } from '@yiru/workbench-model/ui'
import type { BrowserBackResult } from '~shared/runtime-types'

import { AGENT_BROWSER_CLIPBOARD_WRITE_MAX_BYTES } from './agent-browser-bridge-input'
import { AgentBrowserBridgeMouse } from './agent-browser-bridge-mouse'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before

export abstract class AgentBrowserBridgeStorage extends AgentBrowserBridgeMouse {
  async mouseUp(
    button?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['mouse', 'up']
      if (button) {
        args.push(button)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  async mouseWheel(
    dy: number,
    dx?: number,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['mouse', 'wheel', String(dy)]
      if (dx != null) {
        args.push(String(dx))
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  // ── Find (semantic locators) ──

  async find(
    locator: string,
    value: string,
    action: string,
    text?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['find', locator, value, action]
      if (text) {
        args.push(text)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  // ── Set commands ──

  async setDevice(
    name: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'set',
        'device',
        name
      ])) as BrowserAgentCommandResult
    })
  }

  async setOffline(
    state?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['set', 'offline']
      if (state) {
        args.push(state)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  async setHeaders(
    headersJson: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'set',
        'headers',
        headersJson
      ])) as BrowserAgentCommandResult
    })
  }

  async setCredentials(
    user: string,
    pass: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'set',
        'credentials',
        user,
        pass
      ])) as BrowserAgentCommandResult
    })
  }

  async setMedia(
    colorScheme?: string,
    reducedMotion?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['set', 'media']
      if (colorScheme) {
        args.push(colorScheme)
      }
      if (reducedMotion) {
        args.push(reducedMotion)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  // ── Clipboard commands ──

  async clipboardRead(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'clipboard',
        'read'
      ])) as BrowserAgentCommandResult
    })
  }

  async clipboardWrite(
    text: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    await assertClipboardTextWriteWithinLimitWithYield(text, {
      maxBytes: AGENT_BROWSER_CLIPBOARD_WRITE_MAX_BYTES
    })
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'clipboard',
        'write',
        text
      ])) as BrowserAgentCommandResult
    })
  }

  // ── Dialog commands ──

  async dialogAccept(
    text?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['dialog', 'accept']
      if (text) {
        args.push(text)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  async dialogDismiss(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'dialog',
        'dismiss'
      ])) as BrowserAgentCommandResult
    })
  }

  // ── Storage commands ──

  async storageLocalGet(
    key: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'local',
        'get',
        key
      ])) as BrowserAgentCommandResult
    })
  }

  async storageLocalSet(
    key: string,
    value: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'local',
        'set',
        key,
        value
      ])) as BrowserAgentCommandResult
    })
  }

  async storageLocalClear(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'local',
        'clear'
      ])) as BrowserAgentCommandResult
    })
  }

  async storageSessionGet(
    key: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'session',
        'get',
        key
      ])) as BrowserAgentCommandResult
    })
  }

  async storageSessionSet(
    key: string,
    value: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'session',
        'set',
        key,
        value
      ])) as BrowserAgentCommandResult
    })
  }

  async storageSessionClear(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'session',
        'clear'
      ])) as BrowserAgentCommandResult
    })
  }

  // ── Download command ──

  async download(
    selector: string,
    path: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'download',
        selector,
        path
      ])) as BrowserAgentCommandResult
    })
  }

  // ── Highlight command ──

  async highlight(
    selector: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'highlight',
        selector
      ])) as BrowserAgentCommandResult
    })
  }

  async back(worktreeId?: string, browserPageId?: string): Promise<BrowserBackResult> {
    return this.navigateHistory('back', worktreeId, browserPageId)
  }

  async forward(worktreeId?: string, browserPageId?: string): Promise<BrowserBackResult> {
    return this.navigateHistory('forward', worktreeId, browserPageId)
  }
}
