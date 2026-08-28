import { encodeRuntimePtyId } from '@yiru/runtime-protocol/terminal-identity/id'
import type { RuntimeTerminalFocus } from '@yiru/runtime-protocol/workbench/runtime-types'
import { parsePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'
import { isWebShellServicesConnectionId } from '~main/runtime/rpc/orpc/shell-services-identity'
import {
  requestShellTerminalMount,
  requestShellTerminalReveal
} from '~main/runtime/rpc/orpc/shell-services-reverse-link'

import { copySleepingAgentLaunchConfig } from '../model/terminal-launch'
import { getLatestPtyTitle } from '../model/worktree-status'
import { RuntimeTerminalFindMobileTerminalSurface } from './find-mobile-terminal-surface'

export abstract class RuntimeTerminalWaitForLeafPtyId extends RuntimeTerminalFindMobileTerminalSurface {
  waitForLeafPtyId(handle: string, timeoutMs = 10_000, signal?: AbortSignal): Promise<string> {
    const leaf = this.resolveLeafForHandle(handle)
    if (leaf?.ptyId) {
      return Promise.resolve(leaf.ptyId)
    }

    // Why: when the ptyId changes from null to a real value, the old handle
    // is invalidated in the authority's handle index. Capture the tabId+leafId
    // now so we can look up the leaf directly even after handle invalidation.
    const record = this.terminalSessions.getTerminalHandle(handle)
    const savedTabId = record?.tabId ?? null
    const savedLeafId = record?.leafId ?? null

    return new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      let check: () => void = () => {}
      const cleanup = (): void => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        this.terminalSessions.removeGraphSyncCallback(check)
        signal?.removeEventListener('abort', onAbort)
      }
      const finish = (ptyId: string): void => {
        cleanup()
        resolve(ptyId)
      }
      const fail = (error: Error): void => {
        cleanup()
        reject(error)
      }
      const onAbort = (): void => {
        fail(new Error('request_aborted'))
      }
      if (signal?.aborted) {
        reject(new Error('request_aborted'))
        return
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => {
        fail(new Error('Timed out waiting for PTY to spawn'))
      }, timeoutMs)

      check = (): void => {
        // Try the handle first (works if handle wasn't invalidated yet)
        let ptyId = this.resolveLeafForHandle(handle)?.ptyId
        // Why: when ptyId transitions null→real, issueHandle invalidates the
        // old handle. Fall back to direct leaf lookup by the saved coordinates.
        if (!ptyId && savedTabId && savedLeafId) {
          const directLeaf = this.terminalSessions.getGraphLeafByKey(
            this.getLeafKey(savedTabId, savedLeafId)
          )
          ptyId = directLeaf?.ptyId ?? null
        }
        if (ptyId) {
          finish(ptyId)
        }
      }
      this.terminalSessions.addGraphSyncCallback(check)
      check()
    })
  }

  // Why: never-mounted tabs have no attached PTY or mobile snapshot; synthetic
  // handles need the ptyId so the renderer can mount the exact owning tab.

  async requestRendererTerminalTabMount(
    handle: string,
    shellConnectionId: string | undefined
  ): Promise<boolean> {
    const record = this.terminalSessions.getTerminalHandle(handle)
    if (!record?.worktreeId) {
      return false
    }
    const tabId = record.tabId.startsWith('pty:') ? undefined : record.tabId
    // Why: the renderer resolves this against tab.ptyId (a `runtime:`-wrapped
    // wire id) via resolveTerminalTabIdForPtyId's raw string equality —
    // sending the bare controller handle here silently fails that match and
    // the renderer never mounts the tab mobile is waiting on.
    const ptyId = record.ptyId ? encodeRuntimePtyId(handle) : undefined
    if (!tabId && !ptyId) {
      return false
    }
    const result = await requestShellTerminalMount(shellConnectionId, {
      worktreeId: record.worktreeId,
      ...(tabId ? { tabId } : {}),
      ...(ptyId ? { ptyId } : {})
    })
    return result.ok && result.accepted
  }

  // Why: a leaf appears in the graph before its PTY spawns. If we issue a
  // handle while ptyId is null, the next graph sync after PTY spawn will
  // change ptyId and invalidate the handle. Wait for a connected PTY so
  // the handle is stable and immediately usable for send/read/wait.

  protected countLeavesInTab(tabId: string): number {
    let count = 0
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (leaf.tabId === tabId) {
        count++
      }
    }
    return count
  }

  protected resolveHandleForTab(tabId: string): string | null {
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (leaf.tabId === tabId && leaf.ptyId !== null) {
        return this.issueHandle(leaf)
      }
    }
    return null
  }

  async focusTerminal(handle: string): Promise<RuntimeTerminalFocus> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      if (!pty.pty.connected) {
        throw new Error('terminal_exited')
      }
      const parsedPaneKey = parsePaneKey(pty.pty.paneKey ?? '')
      const revealed = this.shellConnectionId
        ? await requestShellTerminalReveal(this.shellConnectionId, {
            worktreeId: pty.pty.worktreeId,
            // Why: shell adoption requires the canonical `runtime:` wire shape.
            ptyId: encodeRuntimePtyId(handle),
            durablePtyId: pty.pty.ptyId,
            title: getLatestPtyTitle(pty.pty),
            ...(pty.pty.launchConfig
              ? { launchConfig: copySleepingAgentLaunchConfig(pty.pty.launchConfig) }
              : {}),
            ...(pty.pty.launchToken ? { launchToken: pty.pty.launchToken } : {}),
            ...(pty.pty.launchAgent ? { launchAgent: pty.pty.launchAgent } : {}),
            ...(pty.pty.tabId !== null ? { tabId: pty.pty.tabId } : {}),
            ...(parsedPaneKey ? { leafId: parsedPaneKey.leafId } : {}),
            ...(isWebShellServicesConnectionId(this.shellConnectionId)
              ? { source: 'runtime-session' as const }
              : {})
          })
        : null
      return {
        handle,
        tabId: revealed?.ok ? revealed.tabId : (pty.pty.tabId ?? pty.record.tabId),
        worktreeId: pty.pty.worktreeId
      }
    }
    this.assertGraphReady()
    const { leaf } = this.getLiveLeafForHandle(handle)
    this.dispatchShellCommand({
      type: 'focusTerminal',
      tabId: leaf.tabId,
      worktreeId: leaf.worktreeId,
      leafId: leaf.leafId
    })
    return { handle, tabId: leaf.tabId, worktreeId: leaf.worktreeId }
  }
}
