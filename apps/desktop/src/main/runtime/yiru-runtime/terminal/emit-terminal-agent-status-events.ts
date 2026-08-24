import type { ParsedAgentStatusPayload } from '@yiru/workbench-model/agent'
import type { ProcessedAgentStatusChunk } from '~shared/agent/status-osc'

import { RuntimeTerminalApplyTrackedPtyTitle } from './apply-tracked-pty-title'

export abstract class RuntimeTerminalEmitTerminalAgentStatusEvents extends RuntimeTerminalApplyTrackedPtyTitle {
  protected emitTerminalAgentStatusEvents(
    ptyId: string,
    chunk: ProcessedAgentStatusChunk
  ): boolean {
    // Why: snapshot retention (for mobile worktree.ps) must run even when no
    // renderer listener is attached, so we don't early-return on a missing
    // onTerminalAgentStatus — only the per-target emit below is gated on it.
    if (chunk.payloads.length === 0) {
      return false
    }
    const targets = new Map<
      string,
      {
        source: 'mounted-leaf' | 'pty-record'
        paneKey: string
        tabId?: string
        worktreeId?: string
        connectionId?: string | null
      }
    >()
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    const connectionId = pty?.connectionId ?? null
    for (const leaf of this.getLeavesForPty(ptyId)) {
      const paneKey = this.makeRuntimePaneKey(leaf)
      targets.set(paneKey, {
        source: 'mounted-leaf',
        paneKey,
        tabId: leaf.tabId,
        worktreeId: leaf.worktreeId,
        connectionId
      })
    }
    if (targets.size === 0 && pty?.paneKey) {
      targets.set(pty.paneKey, {
        source: 'pty-record',
        paneKey: pty.paneKey,
        tabId: pty.tabId ?? undefined,
        worktreeId: pty.worktreeId,
        connectionId
      })
    }
    let retainedChanged = false
    for (const payload of chunk.payloads) {
      for (const target of targets.values()) {
        retainedChanged =
          this.retainAgentRowSnapshot(
            ptyId,
            target.paneKey,
            target.worktreeId,
            target.tabId,
            payload
          ) || retainedChanged
        if (!this.onTerminalAgentStatus) {
          continue
        }
        try {
          this.onTerminalAgentStatus({
            ptyId,
            ...target,
            payload
          })
        } catch (err) {
          console.error('[runtime] terminal agent status listener threw', {
            ptyId,
            paneKey: target.paneKey,
            state: payload.state,
            agentType: payload.agentType,
            err
          })
        }
      }
    }
    return retainedChanged
  }

  protected retainAgentRowSnapshot(
    ptyId: string,
    paneKey: string,
    worktreeId: string | undefined,
    tabId: string | undefined,
    payload: ParsedAgentStatusPayload
  ): boolean {
    const now = Date.now()
    const previous = this.latestAgentStatusByPaneKey.get(paneKey)
    // Why: stateStartedAt must mark the transition into the current state, not
    // every within-state ping (tool/prompt updates keep the state but refresh
    // updatedAt) — mirrors AgentStatusEntry.stateStartedAt on the desktop side.
    const stateStartedAt =
      previous && previous.payload.state === payload.state ? previous.stateStartedAt : now
    this.latestAgentStatusByPaneKey.set(paneKey, {
      paneKey,
      ptyId,
      worktreeId,
      tabId,
      payload,
      stateStartedAt,
      updatedAt: now
    })
    // Client-visible change detection: snapshot republish is gated on this so
    // repeated same-state hook pings don't fan a rebuild out to every client.
    return (
      !previous ||
      previous.payload.state !== payload.state ||
      previous.payload.prompt !== payload.prompt ||
      (previous.payload.agentType ?? null) !== (payload.agentType ?? null) ||
      (previous.payload.toolName ?? null) !== (payload.toolName ?? null) ||
      (previous.payload.interactivePrompt ?? null) !== (payload.interactivePrompt ?? null) ||
      (previous.payload.interrupted ?? false) !== (payload.interrupted ?? false)
    )
  }

  protected clearAgentRowSnapshotsForPty(ptyId: string): void {
    for (const [paneKey, snapshot] of this.latestAgentStatusByPaneKey) {
      if (snapshot.ptyId === ptyId) {
        this.latestAgentStatusByPaneKey.delete(paneKey)
      }
    }
  }

  getPtyOutputSequence(ptyId: string): number {
    return this.ptyOutputSequenceById.get(ptyId) ?? 0
  }
}
