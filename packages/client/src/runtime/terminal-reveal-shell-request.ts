import type {
  ShellServicesTerminalRevealInput,
  ShellServicesTerminalRevealOutput
} from '@yiru/runtime-protocol/contract'
import {
  activateTerminalInitiatedWorktree,
  focusTerminalInitiatedTab,
  isRuntimeEnvironmentActive
} from '~renderer/application-shell/use-ipc-events'
import { SPLIT_TERMINAL_PANE_EVENT } from '~renderer/constants/terminal'
import type { SplitTerminalPaneDetail } from '~renderer/constants/terminal'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionIdFromState } from '~renderer/lib/connection-context'
import { initialAgentTabViewModeProps } from '~renderer/lib/native-chat-initial-view-mode'
import { isNativeChatTranscriptLocalReadable } from '~renderer/lib/native-chat-transcript-readability'
import { useAppStore } from '~renderer/store'
import { singlePaneLayoutSnapshot } from '~renderer/store/slices/terminal-helpers'
import { makePaneKey } from '~shared/stable-pane-id'

import { resolveTerminalPresentation } from './terminal-create-presentation'
import { activateExistingLeafInLayout, addSplitLeafToLayout } from './terminal-reveal-split-layout'

function tryMakePaneKey(tabId: string, leafId: string): string | null {
  try {
    return makePaneKey(tabId, leafId)
  } catch {
    return null
  }
}

// Why: Phase 5 slice S4b (terminal creation cluster) — implements
// `shellServices.terminal.reveal` (see shell-services-handler.ts). This is
// the exact logic the removed `onCreateTerminal` IPC listener in
// use-ipc-events.ts used to run for its requestId-bearing branch; moved here
// so that heavily-contested file only keeps its subscription wiring, not
// this feature's business logic (same extraction shape as
// browser-tab-shell-requests.ts for the browser tab trio). `reveal` adopts a
// PTY main already spawned (`ptyId` is required by the contract), unlike
// terminal-create-shell-request.ts's `create`, where the renderer owns the
// spawn. `command`/`env` are deliberately absent from this input: the only
// live caller (`notifier.revealTerminalSession`) is called after
// `ptyController.spawn` already ran, so it never had a startup command to
// queue — the removed fire-and-forget `notifier.createTerminal` was the only
// sender that ever populated those fields on this channel, and it had zero
// call sites (see 切片 44's dead-branch finding).
export function revealTerminalSessionViaShell(
  input: ShellServicesTerminalRevealInput
): ShellServicesTerminalRevealOutput {
  if (isRuntimeEnvironmentActive() && input.source !== 'runtime-session') {
    throw new Error(
      translate(
        'auto.hooks.useIpcEvents.60428567b4',
        'Local terminal reveal is unavailable while a remote runtime is active'
      )
    )
  }
  const {
    worktreeId,
    ptyId,
    title,
    cwd,
    launchConfig,
    launchToken,
    launchAgent,
    viewMode,
    isFriday,
    activate,
    presentation,
    tabId,
    leafId,
    splitFromLeafId,
    splitDirection,
    splitTelemetrySource
  } = input
  const store = useAppStore.getState()
  const terminalPresentation = resolveTerminalPresentation({ presentation, activate })
  const shouldActivate = terminalPresentation === 'focused'
  const shouldSurfaceOwner = terminalPresentation !== 'background'
  if (shouldActivate) {
    activateTerminalInitiatedWorktree(store, worktreeId)
  }
  const worktreeTabs = store.tabsByWorktree[worktreeId] ?? []
  const existingTab = worktreeTabs.find(
    (candidate) =>
      candidate.ptyId === ptyId || (store.ptyIdsByTabId[candidate.id] ?? []).includes(ptyId)
  )
  const isSplitReveal = Boolean(tabId && leafId && splitFromLeafId)
  const splitTargetTab = isSplitReveal
    ? worktreeTabs.find((candidate) => candidate.id === tabId)
    : undefined
  if (isSplitReveal && !splitTargetTab) {
    throw new Error(`Terminal tab ${tabId} not found`)
  }
  const hintedPendingTab =
    tabId && !isSplitReveal
      ? worktreeTabs.find((candidate) => {
          if (candidate.id !== tabId) {
            return false
          }
          const candidatePtyIds = store.ptyIdsByTabId[candidate.id] ?? []
          return candidate.ptyId == null && candidatePtyIds.length === 0
        })
      : undefined
  // Why: runtime fallback can reveal a PTY for a renderer-created pending
  // tab; that id collision is adoption only until another PTY is already
  // associated with the hinted tab.
  const reusedTab = existingTab ?? splitTargetTab ?? hintedPendingTab
  const tab =
    reusedTab ??
    store.createTab(worktreeId, undefined, undefined, {
      initialPtyId: ptyId,
      activate: shouldActivate,
      ...(launchAgent
        ? {
            launchAgent,
            // Why: a paired client resolved explicit mode before PTY
            // materialization; only omitted mode uses host defaults.
            ...(viewMode
              ? { viewMode }
              : initialAgentTabViewModeProps(store.settings, {
                  agent: launchAgent,
                  nativeChatTranscriptIsLocalReadable: isNativeChatTranscriptLocalReadable(
                    getConnectionIdFromState(store, worktreeId)
                  )
                }))
          }
        : {}),
      ...(isFriday ? { isFriday: true } : {}),
      ...(cwd ? { startupCwd: cwd } : {}),
      // Why: tabId hint comes from CLI-spawned PTYs whose env already has the
      // pane key baked in. Adopting the tab under the same id keeps
      // hook-event attribution working.
      ...(tabId !== undefined ? { id: tabId } : {})
    })
  // Why: when an existing tab already owns this ptyId, we reuse it instead of
  // minting a new one — but the PTY env already carries a paneKey from main.
  // If the existing tab id doesn't match the hint, hook attribution degrades
  // for that PTY's lifetime. Warn so this is visible during development.
  if (tabId !== undefined && tab.id !== tabId) {
    console.warn(
      `[revealTerminalSessionViaShell] tabId hint ${tabId} ignored for ptyId ${ptyId}; existing tab ${tab.id} adopted instead (hook attribution will degrade for this terminal)`
    )
  }
  if (shouldActivate) {
    store.setActiveTabType('terminal')
    store.setActiveTab(tab.id)
  }
  if (viewMode && reusedTab) {
    // Why: reopening the assistant should return its existing tab to chat
    // after the user previously used the raw-terminal escape.
    store.setTabViewMode(tab.id, viewMode)
  }
  if (isFriday) {
    store.markTabAsFriday(tab.id)
  }
  if (shouldSurfaceOwner) {
    store.revealWorktreeInSidebar(worktreeId)
    focusTerminalInitiatedTab(tab.id, leafId)
  }
  // Why: only stamp the runtime-supplied title on freshly created tabs.
  // Existing tabs may have a user customTitle (set via UI rename) that the
  // runtime's stored title would otherwise silently overwrite on every focus.
  if (title && !reusedTab) {
    store.setTabCustomTitle(tab.id, title, { recordInteraction: false })
  }
  if (leafId) {
    const launchPaneKey = tryMakePaneKey(tab.id, leafId)
    if (launchConfig) {
      if (launchPaneKey) {
        store.registerAgentLaunchConfig(launchPaneKey, launchConfig, {
          ...(launchAgent ? { agentType: launchAgent } : {}),
          ...(launchToken ? { launchToken } : {}),
          tabId: tab.id,
          leafId
        })
      }
    } else if (!splitFromLeafId && launchPaneKey) {
      store.clearAgentLaunchConfig(launchPaneKey)
    }
    if (splitFromLeafId) {
      // Why: runtime-spawned split PTYs already carry the parent tab's
      // paneKey. Reusing the existing tab preserves native split-pane
      // behavior instead of letting createTab mint a collision tab.
      store.updateTabPtyId(tab.id, ptyId)
      const existingLayout = store.terminalLayoutsByTabId?.[tab.id]
      const sourcePtyId = existingLayout?.ptyIdsByLeafId?.[splitFromLeafId]
      store.setTabLayout(
        tab.id,
        addSplitLeafToLayout(
          existingLayout,
          splitFromLeafId,
          leafId,
          ptyId,
          splitDirection ?? 'horizontal',
          title,
          shouldActivate
        )
      )
      window.dispatchEvent(
        new CustomEvent<SplitTerminalPaneDetail>(SPLIT_TERMINAL_PANE_EVENT, {
          detail: {
            tabId: tab.id,
            paneRuntimeId: -1,
            direction: splitDirection ?? 'horizontal',
            sourceLeafId: splitFromLeafId,
            sourcePtyId,
            telemetrySource: splitTelemetrySource,
            newLeafId: leafId,
            ptyId
          }
        })
      )
    } else {
      // Why: CLI/runtime-spawned PTYs emit hook events before a hidden tab
      // mounts TerminalPane, so the adopted UUID leaf must exist in layout
      // state for paneKey validation to accept them.
      const existingLayout = reusedTab
        ? activateExistingLeafInLayout(store.terminalLayoutsByTabId?.[tab.id], leafId, ptyId, title)
        : null
      if (existingLayout) {
        store.updateTabPtyId(tab.id, ptyId)
        store.setTabLayout(tab.id, existingLayout)
      } else {
        store.setTabLayout(tab.id, singlePaneLayoutSnapshot(leafId, ptyId, title))
      }
    }
  }
  return { tabId: tab.id, title: title ?? tab.title }
}
