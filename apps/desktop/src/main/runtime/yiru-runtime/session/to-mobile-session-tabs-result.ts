import { resolveExplicitTerminalTitleAgentType } from '@yiru/workbench-model/agent'
import {
  normalizeCompatibleAgentStatusEntryForOwner,
  normalizeCompatibleAgentTitleForOwner
} from '~shared/agent/title-owner'
import type {
  RuntimeMobileSessionClientTab,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsSnapshot
} from '~shared/runtime-types'
import { isTerminalLeafId, makePaneKey } from '~shared/stable-pane-id'

import { classifyAgentTitle, getLatestAgentCandidateTitle } from '../model/worktree-status'
import { RuntimeSessionPruneMobileSessionTabGroupLayout } from './prune-mobile-session-tab-group-layout'

export abstract class RuntimeSessionToMobileSessionTabsResult extends RuntimeSessionPruneMobileSessionTabGroupLayout {
  protected toMobileSessionTabsResult(
    snapshot: RuntimeMobileSessionTabsSnapshot
  ): RuntimeMobileSessionTabsResult {
    const tabs: RuntimeMobileSessionClientTab[] = []
    const liveBrowserTabsByPageId = this.getLiveBrowserTabsByPageId(snapshot.worktree)
    // Why: a live PTY backs exactly one terminal surface, so it must map to a
    // single emitted tab. After agent sleep + mobile wake, a stale
    // headless-hydrated leaf can survive beside the renderer's live leaf and both
    // resolve to the freshly-woken agent PTY (same issuePtyHandle handle) — which
    // renders two panes with the same React key and crashes the client. Claim
    // each live PTY once. Split siblings never collide because distinct leaves own
    // distinct PTYs; renderer tabs precede preserved headless tabs, so the live
    // one wins.
    const claimedLivePtyIds = new Set<string>()
    for (const tab of snapshot.tabs) {
      if (tab.type === 'browser') {
        const liveTab = tab.browserPageId
          ? liveBrowserTabsByPageId.get(tab.browserPageId)
          : undefined
        if (!liveTab) {
          continue
        }
        // Why: renderer session snapshots can lag behind BrowserView teardown or
        // process swaps. Pairing clients should only see browser pages the main
        // browser bridge can still route commands and screencasts to.
        tabs.push({
          ...tab,
          title: liveTab.title || tab.title,
          url: liveTab.url || tab.url,
          // Why: bridge "active" means active BrowserView/webContents, not
          // active Yiru tab. Preserve the renderer's app-level session focus.
          isActive: tab.isActive
        })
        continue
      }
      if (tab.type === 'markdown' || tab.type === 'file') {
        tabs.push(tab)
        continue
      }
      const syncedTab = this.terminalSessions.getGraphTab(tab.parentTabId)
      const leaf =
        this.terminalSessions.getGraphLeafByKey(this.getLeafKey(tab.parentTabId, tab.leafId)) ??
        null
      const liveLeaf = leaf?.ptyId && leaf.connected ? leaf : null
      const liveLeafPtyId = liveLeaf?.ptyId
        ? this.resolveLocalRuntimeTerminalPtyId(liveLeaf.ptyId)
        : null
      const liveLeafPty = liveLeafPtyId
        ? (this.terminalSessions.getPtyRecord(liveLeafPtyId) ?? null)
        : null
      const pty = liveLeaf
        ? null
        : this.findPtyForMobileTerminalTab(snapshot.worktree, tab, {
            allowWorktreeOnlyMatch: !snapshot.publicationEpoch.startsWith('headless')
          })
      const livePty = pty?.connected ? pty : null
      // Why: enforce the one-live-PTY-per-tab invariant. A later tab resolving to
      // a PTY an earlier tab already claimed is a duplicate surface (e.g. a stale
      // headless-hydrated leaf re-bound to a woken agent PTY) — drop it so the
      // client never sees two tabs sharing a terminal handle. Handles derive purely
      // from the PTY id (issuePtyHandle), so the id is a faithful proxy for the
      // emitted handle. Pending tabs (no live PTY) are left untouched.
      const resolvedLivePtyId = liveLeafPtyId ?? livePty?.ptyId ?? null
      if (resolvedLivePtyId !== null) {
        if (claimedLivePtyIds.has(resolvedLivePtyId)) {
          continue
        }
        claimedLivePtyIds.add(resolvedLivePtyId)
      }
      const legacyPaneId = /^pane:(\d+)$/.exec(tab.leafId)?.[1] ?? null
      const paneKey = isTerminalLeafId(tab.leafId)
        ? makePaneKey(tab.parentTabId, tab.leafId)
        : `${tab.parentTabId}:${legacyPaneId ?? tab.leafId}`
      const leafTitle = leaf
        ? getLatestAgentCandidateTitle(
            { title: leaf.paneTitle, updatedAt: leaf.paneTitleUpdatedAt },
            { title: leaf.lastOscTitle, updatedAt: leaf.lastOscTitleAt }
          )
        : null
      const ptyTitle = pty
        ? getLatestAgentCandidateTitle(
            { title: pty.title, updatedAt: pty.titleUpdatedAt },
            { title: pty.lastOscTitle, updatedAt: pty.lastOscTitleAt }
          )
        : null
      const launchAgent = tab.launchAgent ?? liveLeafPty?.launchAgent ?? pty?.launchAgent ?? null
      const ownerAgent = launchAgent ?? liveLeafPty?.foregroundAgent ?? pty?.foregroundAgent ?? null
      const title = normalizeCompatibleAgentTitleForOwner(
        leafTitle ?? ptyTitle ?? syncedTab?.title ?? tab.title,
        ownerAgent
      )
      const liveTitleEvidence = leafTitle ?? ptyTitle
      const liveTitleEvidenceClassification = classifyAgentTitle(liveTitleEvidence)
      const hookAgentStatus = this.getFreshHookAgentStatusForMobileTab(
        snapshot.worktree,
        paneKey,
        tab
      )
      // Why: runtime-backed terminal snapshots may omit the provider session
      // even though the hook stream already knows its canonical identity.
      const freshestAgentStatus =
        hookAgentStatus &&
        (!tab.agentStatus || hookAgentStatus.updatedAt > tab.agentStatus.updatedAt)
          ? hookAgentStatus
          : tab.agentStatus
      const mergedAgentStatus = freshestAgentStatus
        ? {
            ...freshestAgentStatus,
            ...(!freshestAgentStatus.agentType && hookAgentStatus?.agentType
              ? { agentType: hookAgentStatus.agentType }
              : {}),
            ...(!freshestAgentStatus.providerSession && hookAgentStatus?.providerSession
              ? { providerSession: hookAgentStatus.providerSession }
              : {})
          }
        : null
      const normalizedTabAgentStatus = mergedAgentStatus
        ? normalizeCompatibleAgentStatusEntryForOwner(mergedAgentStatus, ownerAgent)
        : null
      const resolvedAgentType =
        normalizedTabAgentStatus?.agentType ??
        launchAgent ??
        resolveExplicitTerminalTitleAgentType(title)
      // Why: keep the rich hook-driven status when the agent has a live
      // interactive prompt or an active tool — those are authoritative agent
      // activity even if the terminal's title isn't agent-classified (e.g. it
      // shows a task/branch name). Otherwise the mobile/web client falls back to
      // the OSC-title-only status and never sees interactivePrompt (the question
      // card never renders).
      const hasLiveAgentSignal =
        normalizedTabAgentStatus?.interactivePrompt != null ||
        normalizedTabAgentStatus?.toolName != null
      const keepFullAgentStatus =
        normalizedTabAgentStatus &&
        (liveTitleEvidence === null ||
          liveTitleEvidenceClassification === 'agent' ||
          hasLiveAgentSignal)
      const agentStatus = keepFullAgentStatus
        ? { agentStatus: normalizedTabAgentStatus }
        : // Why: when live title evidence says the pane is idle (e.g. the Claude
          // agents picker or a neutral shell title), suppress the stale "working"
          // state so the client shows no spinner — but retain agent identity
          // (agentType + providerSession) so history can still address the
          // idle agent's transcript. Reset the transient state to 'done'.
          normalizedTabAgentStatus?.agentType != null
          ? {
              agentStatus: {
                state: 'done' as const,
                prompt: '',
                updatedAt: normalizedTabAgentStatus.updatedAt,
                stateStartedAt: normalizedTabAgentStatus.stateStartedAt,
                paneKey: normalizedTabAgentStatus.paneKey,
                stateHistory: [],
                agentType: normalizedTabAgentStatus.agentType,
                ...(normalizedTabAgentStatus.providerSession
                  ? { providerSession: normalizedTabAgentStatus.providerSession }
                  : {})
              }
            }
          : null
      // Why: web/mobile clients hold these handles across renderer graph syncs;
      // leaf handles are graph-epoch-bound, but PTY handles remain streamable.
      const terminalPty = liveLeafPtyId
        ? this.recordPtyWorktree(liveLeafPtyId, snapshot.worktree, {
            tabId: tab.parentTabId,
            paneKey,
            connected: true
          })
        : livePty
      const terminalHandle = terminalPty ? this.issuePtyHandle(terminalPty) : null
      tabs.push({
        type: 'terminal',
        id: tab.id,
        parentTabId: tab.parentTabId,
        leafId: tab.leafId,
        title,
        ...(tab.ptyId ? { ptyId: tab.ptyId } : {}),
        ...(tab.terminalTheme ? { terminalTheme: tab.terminalTheme } : {}),
        ...(launchAgent ? { launchAgent } : {}),
        ...(resolvedAgentType ? { resolvedAgentType } : {}),
        ...(agentStatus ?? this.buildPtyMobileAgentStatus(livePty ?? pty, tab, terminalHandle)),
        ...(tab.parentLayout ? { parentLayout: tab.parentLayout } : {}),
        ...(tab.startupCwd ? { startupCwd: tab.startupCwd } : {}),
        ...(tab.color != null ? { color: tab.color } : {}),
        ...(tab.isPinned ? { isPinned: true } : {}),
        isActive: tab.isActive,
        ...(terminalHandle
          ? {
              status: 'ready' as const,
              terminal: terminalHandle,
              worktreeInstanceId: terminalPty?.worktreeInstanceId ?? null
            }
          : { status: 'pending-handle' as const, terminal: null })
      })
    }
    const active =
      tabs.find((tab) => tab.isActive && tab.id === snapshot.activeTabId) ??
      tabs.find((tab) => tab.isActive) ??
      (snapshot.activeTabId ? (tabs[0] ?? null) : null)
    const normalizedTabs =
      active && !tabs.some((tab) => tab.isActive)
        ? tabs.map((tab) => (tab.id === active.id ? { ...tab, isActive: true } : tab))
        : tabs
    const tabGroups = this.sanitizeMobileSessionTabGroups(snapshot.tabGroups, normalizedTabs)
    const validGroupIds = new Set(tabGroups?.map((group) => group.id) ?? [])
    const tabGroupLayout =
      snapshot.tabGroupLayout === undefined
        ? undefined
        : this.pruneMobileSessionTabGroupLayout(snapshot.tabGroupLayout, validGroupIds)
    const activeGroupId =
      snapshot.activeGroupId && validGroupIds.has(snapshot.activeGroupId)
        ? snapshot.activeGroupId
        : (tabGroups?.find((group) =>
            active
              ? group.tabOrder.some((tabId) =>
                  this.collectReturnedSessionTabIds([active]).has(tabId)
                )
              : false
          )?.id ??
          tabGroups?.[0]?.id ??
          null)
    return {
      worktree: snapshot.worktree,
      publicationEpoch: snapshot.publicationEpoch,
      snapshotVersion: snapshot.snapshotVersion,
      activeGroupId,
      activeTabId: active?.id ?? null,
      activeTabType: active?.type ?? null,
      ...(tabGroups ? { tabGroups } : {}),
      ...(snapshot.tabGroupLayout !== undefined ? { tabGroupLayout } : {}),
      tabs: normalizedTabs
    }
  }
}
