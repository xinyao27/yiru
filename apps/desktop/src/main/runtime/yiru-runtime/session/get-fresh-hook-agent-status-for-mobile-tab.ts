import {
  AGENT_STATUS_STALE_AFTER_MS,
  type AgentStatusIpcPayload,
  type AgentStatusEntry
} from '@yiru/workbench-model/agent'
import {
  normalizeCompatibleAgentStatusEntryForOwner,
  normalizeCompatibleAgentTitleForOwner
} from '~shared/agent/title-owner'
import type { RuntimeMobileSessionTerminalTab } from '~shared/runtime-types'

import type { RuntimeAgentRowSnapshot } from '../model/terminal-observation'
import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import {
  classifyAgentTitle,
  getLatestAgentCandidateTitle,
  getLatestPtyTitle
} from '../model/worktree-status'
import { RuntimeSessionToMobileSessionTabsResult } from './to-mobile-session-tabs-result'

export abstract class RuntimeSessionGetFreshHookAgentStatusForMobileTab extends RuntimeSessionToMobileSessionTabsResult {
  protected getFreshHookAgentStatusForMobileTab(
    worktreeId: string,
    paneKey: string,
    tab: RuntimeMobileSessionTerminalTab
  ): AgentStatusEntry | null {
    const now = Date.now()
    let latest: AgentStatusIpcPayload | null = null
    for (const entry of this.getAgentStatusSnapshotFn?.() ?? []) {
      if (now - entry.receivedAt > AGENT_STATUS_STALE_AFTER_MS) {
        continue
      }
      const matchesPane = entry.paneKey === paneKey
      const matchesTab =
        entry.tabId === tab.parentTabId &&
        (entry.worktreeId === undefined || entry.worktreeId === worktreeId)
      if (!matchesPane && !matchesTab) {
        continue
      }
      if (!latest || entry.receivedAt > latest.receivedAt) {
        latest = entry
      }
    }
    if (!latest) {
      return null
    }
    return {
      state: latest.state,
      prompt: latest.prompt,
      updatedAt: latest.receivedAt,
      stateStartedAt: latest.stateStartedAt,
      paneKey: latest.paneKey,
      stateHistory: [],
      ...(latest.terminalHandle ? { terminalHandle: latest.terminalHandle } : {}),
      ...(latest.tabId ? { tabId: latest.tabId } : {}),
      ...(latest.worktreeId ? { worktreeId: latest.worktreeId } : {}),
      connectionId: latest.connectionId,
      ...(latest.agentType ? { agentType: latest.agentType } : {}),
      ...(latest.model ? { model: latest.model } : {}),
      ...(latest.toolName ? { toolName: latest.toolName } : {}),
      ...(latest.toolInput ? { toolInput: latest.toolInput } : {}),
      ...(latest.interactivePrompt ? { interactivePrompt: latest.interactivePrompt } : {}),
      ...(latest.lastAssistantMessage ? { lastAssistantMessage: latest.lastAssistantMessage } : {}),
      ...(latest.interrupted ? { interrupted: true } : {}),
      ...(latest.orchestration ? { orchestration: latest.orchestration } : {}),
      ...(latest.providerSession ? { providerSession: latest.providerSession } : {}),
      ...(latest.subagents ? { subagents: latest.subagents } : {})
    }
  }

  /**
   * Generates a mobile-friendly status entry for a PTY, aligning agentType
   * and titles with the active owner.
   */

  protected buildPtyMobileAgentStatus(
    pty: RuntimePtyWorktreeRecord | null,
    tab: RuntimeMobileSessionTerminalTab,
    terminalHandle: string | null
  ): { agentStatus: AgentStatusEntry } | Record<string, never> {
    const paneKey = this.getMobileTerminalPaneKey(tab)
    const retained = this.getFreshRetainedAgentStatusForMobileTab(paneKey, pty, tab)
    if (!pty?.lastAgentStatus && !retained) {
      return {}
    }
    const leaf =
      this.terminalSessions.getGraphLeafByKey(this.getLeafKey(tab.parentTabId, tab.leafId)) ?? null
    const ptyTitle = pty
      ? getLatestAgentCandidateTitle(
          { title: pty.title, updatedAt: pty.titleUpdatedAt },
          { title: pty.lastOscTitle, updatedAt: pty.lastOscTitleAt }
        )
      : leaf
        ? getLatestAgentCandidateTitle(
            { title: leaf.paneTitle, updatedAt: leaf.paneTitleUpdatedAt },
            { title: leaf.lastOscTitle, updatedAt: leaf.lastOscTitleAt }
          )
        : null
    const ptyTitleClassification = classifyAgentTitle(ptyTitle)
    if (ptyTitle !== null && ptyTitleClassification !== 'agent') {
      // Why: a non-agent title means the shell owns the pane again (the agent
      // exited or was replaced) — suppressing here is what clears stuck
      // spinners (#1437). A live hook signal (question card / active tool) is
      // authoritative agent activity even under a task-named title, so it
      // survives the suppression, mirroring the renderer-synced branch above.
      const hasLiveHookSignal =
        retained?.payload.interactivePrompt != null || retained?.payload.toolName != null
      if (!hasLiveHookSignal) {
        return {}
      }
    }
    const ownerAgent = tab.launchAgent ?? pty?.launchAgent ?? pty?.foregroundAgent ?? null
    const terminalTitle = normalizeCompatibleAgentTitleForOwner(
      (pty ? getLatestPtyTitle(pty) : null) ?? tab.title,
      ownerAgent
    )
    // Why: hook (OSC 9999) payloads carry the real state, prompt, and agent
    // identity; the title heuristic below is a fallback with none of that.
    // Without this, headless-serve clients only ever saw title-derived rows
    // and hook-only transitions (e.g. opencode waiting) never surfaced (#7970).
    if (retained) {
      return {
        agentStatus: normalizeCompatibleAgentStatusEntryForOwner(
          {
            ...retained.payload,
            paneKey,
            updatedAt: retained.updatedAt,
            stateStartedAt: retained.stateStartedAt,
            stateHistory: [],
            ...(terminalHandle ? { terminalHandle } : {}),
            ...((pty?.worktreeId ?? retained.worktreeId)
              ? { worktreeId: pty?.worktreeId ?? retained.worktreeId }
              : {}),
            tabId: tab.parentTabId,
            terminalTitle
          },
          ownerAgent
        )
      }
    }
    const now = pty!.lastOutputAt ?? Date.now()
    const agentType = ownerAgent ?? undefined
    return {
      agentStatus: {
        state:
          pty!.lastAgentStatus === 'working'
            ? 'working'
            : pty!.lastAgentStatus === 'permission'
              ? 'blocked'
              : 'done',
        prompt: '',
        updatedAt: now,
        stateStartedAt: now,
        paneKey,
        ...(terminalHandle ? { terminalHandle } : {}),
        ...(agentType ? { agentType } : {}),
        worktreeId: pty!.worktreeId,
        tabId: tab.parentTabId,
        terminalTitle,
        stateHistory: []
      }
    }
  }

  /** The retained OSC 9999 hook row for this mobile tab, when fresh enough to
   *  trust. Looked up by pane identity first, then by PTY ownership because
   *  legacy `pane:N` leaf ids can drift from the hook-side pane key. */

  protected getFreshRetainedAgentStatusForMobileTab(
    paneKey: string,
    pty: RuntimePtyWorktreeRecord | null,
    tab: RuntimeMobileSessionTerminalTab
  ): RuntimeAgentRowSnapshot | null {
    let retained = this.latestAgentStatusByPaneKey.get(paneKey) ?? null
    if (!retained) {
      const ptyId = pty?.ptyId ?? tab.ptyId ?? null
      if (ptyId) {
        for (const snapshot of this.latestAgentStatusByPaneKey.values()) {
          if (snapshot.ptyId !== ptyId) {
            continue
          }
          if (!retained || snapshot.updatedAt > retained.updatedAt) {
            retained = snapshot
          }
        }
      }
    }
    if (!retained || Date.now() - retained.updatedAt > AGENT_STATUS_STALE_AFTER_MS) {
      return null
    }
    return retained
  }
}
