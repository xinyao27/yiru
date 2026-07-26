import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { TabGroupLayoutNode } from '../../../../shared/types'
import { useBrowserMobileDriverForAny } from '../../lib/pane-manager/browser-mobile-driver-state'
import { useAppStore } from '../../store'
import type { ActivityTerminalPortalTarget } from '../activity/terminal-portal'
import { useBrowserAutomationVisibilityForAny } from '../browser-pane/browser-automation-visibility'
import BrowserPaneOverlayLayer from '../browser-pane/overlay-layer'
import CodexRestartChip from '../codex-restart-chip'
import EmulatorPaneOverlayLayer from '../emulator-pane/overlay-layer'
import AiVaultSessionDropLayer from '../tab-group/ai-vault-session-drop-layer'
import TabGroupSplitLayout from '../tab-group/split-layout'
import TerminalPaneOverlayLayer from '../terminal-pane/overlay-layer'

type WorktreeSplitSurfaceProps = {
  worktreeId: string
  worktreePath: string
  layout: TabGroupLayoutNode
  focusedGroupId?: string
  isVisible: boolean
  shouldMeasureHiddenWorktree: boolean
  shouldColdParkTerminalPanes: boolean
  activityTerminalPortals: ActivityTerminalPortalTarget[]
  backgroundMountTabIds: ReadonlySet<string> | null
  activationDeferredMountTabIds: ReadonlySet<string> | null
}

// Why: each TabGroupPanel tags its body element with an `anchor-name`, and
// worktree-level overlay layers render every terminal/browser tab once —
// keyed by pane id only — then pin each pane to the owning group's anchor via
// CSS `position-anchor`. Moving a tab between groups now only changes which
// anchor-name the overlay references, so terminals do not remount and
// webviews do not reparent/reload.
//
// Why `React.memo`: the workspace panel has many store subscriptions and
// re-renders on unrelated updates (terminal keystrokes, editor edits, focus
// changes). Without memoization, every panel re-render would cascade into
// BrowserPaneOverlayLayer and its BrowserPane subtrees. Memoizing here means
// the surface only re-renders when its own props (worktreeId / layout /
// focusedGroupId / isVisible) actually change.
export const WorktreeSplitSurface = React.memo(function WorktreeSplitSurface({
  worktreeId,
  worktreePath,
  layout,
  focusedGroupId,
  isVisible,
  shouldMeasureHiddenWorktree,
  shouldColdParkTerminalPanes,
  activityTerminalPortals,
  backgroundMountTabIds,
  activationDeferredMountTabIds
}: WorktreeSplitSurfaceProps): React.JSX.Element {
  const browserPageIds = useAppStore(
    useShallow((state) =>
      (state.browserTabsByWorktree[worktreeId] ?? []).flatMap((tab) =>
        tab.pageIds && tab.pageIds.length > 0 ? tab.pageIds : [tab.activePageId ?? tab.id]
      )
    )
  )
  const hasAutomationVisibleBrowser = useBrowserAutomationVisibilityForAny(browserPageIds)
  const hasMobileDrivenBrowser = useBrowserMobileDriverForAny(browserPageIds)
  const shouldKeepPaintable =
    shouldMeasureHiddenWorktree || hasAutomationVisibleBrowser || hasMobileDrivenBrowser

  return (
    <div
      className={
        isVisible
          ? 'absolute inset-0 flex'
          : shouldKeepPaintable
            ? 'pointer-events-none absolute inset-0 flex opacity-0'
            : 'absolute inset-0 hidden'
      }
      // Why: automation and mobile control need paintable webviews, but hidden
      // worktree controls cannot remain reachable by Tab or assistive tech.
      inert={!isVisible}
      aria-hidden={!isVisible}
    >
      <CodexRestartChip isVisible={isVisible} worktreeId={worktreeId} />
      <TabGroupSplitLayout
        layout={layout}
        worktreeId={worktreeId}
        focusedGroupId={focusedGroupId}
        isWorktreeActive={isVisible}
      />
      <TerminalPaneOverlayLayer
        worktreeId={worktreeId}
        worktreePath={worktreePath}
        isWorktreeActive={isVisible}
        coldParkTerminalPanes={shouldColdParkTerminalPanes}
        shouldMeasureHiddenWorktree={shouldMeasureHiddenWorktree}
        activityTerminalPortals={activityTerminalPortals}
        backgroundMountTabIds={backgroundMountTabIds}
        activationDeferredMountTabIds={activationDeferredMountTabIds}
      />
      {isVisible || backgroundMountTabIds === null ? (
        <>
          <BrowserPaneOverlayLayer worktreeId={worktreeId} isWorktreeActive={isVisible} />
          <EmulatorPaneOverlayLayer worktreeId={worktreeId} isWorktreeActive={isVisible} />
        </>
      ) : null}
      {/* Why: keyed by `enabled` so a visibility flip remounts with fresh drag
          state instead of needing an effect to clear a stale active drag. */}
      <AiVaultSessionDropLayer
        key={isVisible ? 'visible' : 'hidden'}
        worktreeId={worktreeId}
        enabled={isVisible}
      />
    </div>
  )
})
