import { useDroppable } from '@dnd-kit/core'
import { Suspense, useMemo } from 'react'
import { X } from '~renderer/components/icons/hugeicons'
import { Button } from '~renderer/components/ui/button'
import { ButtonGroup } from '~renderer/components/ui/button-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import { lazyWithRetry as lazy } from '~renderer/lib/lazy-with-retry'

import { TabBarOpenInMenuButton } from '../tab-bar/open-in-menu-button'
import { TabBarQuickCommandsButton } from '../tab-bar/quick-commands-button'
import TabBar from '../tab-bar/tab-bar'
import { closeTerminalTab } from '../terminal/tab-actions'
import { WorkspaceSidebarChromeSpacer } from '../workspace-panel/sidebar-chrome'
import { tabGroupBodyAnchorName } from './body-anchor'
import { getTabPaneBodyDroppableId, type HoveredTabInsertion } from './use-tab-drag-split'
import { useTabGroupWorkspaceModel } from './use-tab-group-workspace-model'
import { resolveGroupTabFromVisibleId } from './visible-id'
import { WorkspacePaneFrame } from './workspace-pane-frame'

const EditorPanel = lazy(() => import('../editor/panel'))
const GitGraphView = lazy(() => import('../workspace-panel/git-graph/view'))

export default function TabGroupPanel({
  groupId,
  worktreeId,
  isFocused,
  hasSplitGroups,
  touchesRightEdge,
  touchesLeftEdge,
  touchesBottomEdge = false,
  suppressLeftBorder = false,
  suppressRightBorder = false,
  suppressBottomBorder = false,
  reserveWindowControlsSpace,
  reserveCollapsedSidebarHeaderSpace,
  isTabDragActive = false,
  hoveredTabInsertion = null
}: {
  groupId: string
  worktreeId: string
  isFocused: boolean
  hasSplitGroups: boolean
  touchesRightEdge: boolean
  touchesLeftEdge: boolean
  touchesBottomEdge?: boolean
  suppressLeftBorder?: boolean
  suppressRightBorder?: boolean
  suppressBottomBorder?: boolean
  reserveWindowControlsSpace: boolean
  reserveCollapsedSidebarHeaderSpace: boolean
  isTabDragActive?: boolean
  hoveredTabInsertion?: HoveredTabInsertion | null
}): React.JSX.Element {
  const model = useTabGroupWorkspaceModel({ groupId, worktreeId })
  const { activeTab, browserItems, commands, editorItems, tabBarOrder, terminalTabs } = model
  const activeGitGraphTabId = activeTab?.contentType === 'git-graph' ? activeTab.id : null
  const { setNodeRef: setBodyDropRef } = useDroppable({
    id: getTabPaneBodyDroppableId(groupId),
    data: {
      kind: 'pane-body',
      groupId,
      worktreeId
    },
    disabled: !isTabDragActive
  })
  // Why: browser and terminal panes for this worktree are rendered once at the worktree
  // level (BrowserPaneOverlayLayer) and positioned over the owning group's
  // body via CSS anchor positioning. Tagging this body with a per-group
  // `anchor-name` lets the overlay reference it via `position-anchor`;
  // moving a tab between groups only swaps which anchor-name the overlay
  // targets. Browsers avoid `<webview>` reloads; terminals avoid remounting
  // xterm and losing alt-screen TUI state.
  const bodyAnchorName = tabGroupBodyAnchorName(groupId)
  // Why: memoize the style object so the literal isn't recreated on every
  // render. A fresh object every render would make the body `<div>` appear
  // to have a new `style` prop on every parent re-render, which defeats any
  // downstream memoization keyed on referential equality.
  const bodyAnchorStyle = useMemo(
    () => ({ anchorName: bodyAnchorName }) as React.CSSProperties,
    [bodyAnchorName]
  )

  const tabBar = (
    <TabBar
      tabs={terminalTabs}
      activeTabId={activeTab?.contentType === 'terminal' ? activeTab.entityId : null}
      groupId={groupId}
      worktreeId={worktreeId}
      expandedPaneByTabId={model.expandedPaneByTabId}
      onActivate={commands.activateTerminal}
      onClose={(terminalId) => {
        const item = resolveGroupTabFromVisibleId(model.groupTabs, terminalId)
        if (item?.contentType === 'terminal') {
          commands.closeItem(item.id)
          return
        }
        // Why: agent quick-launch can briefly desync unified/runtime tab ids
        // before the host snapshot lands; still route close through the shared
        // terminal close helper instead of no-op'ing.
        closeTerminalTab(terminalId)
      }}
      onCloseOthers={(visibleId) => {
        // Why: TabBar emits this with the entityId for terminals/browsers and
        // the unifiedTabId for editors (see TabBar's per-type wiring). Match
        // both so the menu works on every tab kind, not just terminals.
        const item = resolveGroupTabFromVisibleId(model.groupTabs, visibleId)
        if (item) {
          commands.closeOthers(item.id)
        }
      }}
      onCloseToRight={(visibleId) => {
        const item = resolveGroupTabFromVisibleId(model.groupTabs, visibleId)
        if (item) {
          commands.closeToRight(item.id)
        }
      }}
      onNewTerminalTab={commands.newTerminalTab}
      onNewTerminalWithShell={commands.newTerminalWithShell}
      onNewBrowserTab={commands.newBrowserTab}
      onNewSimulatorTab={commands.newSimulatorTab}
      onOpenEntry={commands.openEntry}
      onNewFileTab={commands.newFileTab}
      onSetCustomTitle={commands.setTabCustomTitle}
      onSetTabColor={commands.setTabColor}
      onTogglePaneExpand={commands.toggleTerminalPaneExpand}
      editorFiles={editorItems}
      browserTabs={browserItems}
      activeFileId={
        !activeTab ||
        activeTab.contentType === 'terminal' ||
        activeTab?.contentType === 'browser' ||
        activeTab?.contentType === 'simulator' ||
        activeTab?.contentType === 'git-graph'
          ? null
          : activeTab.id
      }
      activeBrowserTabId={activeTab?.contentType === 'browser' ? activeTab.entityId : null}
      activeSimulatorTabId={activeTab?.contentType === 'simulator' ? activeTab.id : null}
      activeGitGraphTabId={activeGitGraphTabId}
      activeTabType={
        activeTab?.contentType === 'terminal'
          ? 'terminal'
          : activeTab?.contentType === 'browser'
            ? 'browser'
            : activeTab?.contentType === 'simulator'
              ? 'simulator'
              : 'editor'
      }
      onActivateFile={commands.activateEditor}
      onCloseFile={commands.closeItem}
      onActivateBrowserTab={commands.activateBrowser}
      onActivateGitGraphTab={commands.activateGitGraph}
      onCloseBrowserTab={(browserTabId) => {
        const item = model.groupTabs.find(
          (candidate) => candidate.entityId === browserTabId && candidate.contentType === 'browser'
        )
        if (item) {
          commands.closeItem(item.id)
        }
      }}
      onDuplicateBrowserTab={commands.duplicateBrowserTab}
      onCloseAllFiles={commands.closeAllEditorTabsInGroup}
      onMakePreviewFilePermanent={(_fileId, tabId) => {
        if (!tabId) {
          return
        }
        const item = model.groupTabs.find((candidate) => candidate.id === tabId)
        if (!item) {
          return
        }
        commands.makePreviewFilePermanent(item.entityId, item.id)
      }}
      onPinFile={(_fileId, tabId) => {
        if (!tabId) {
          return
        }
        const item = model.groupTabs.find((candidate) => candidate.id === tabId)
        if (!item) {
          return
        }
        commands.pinFile(item.entityId, item.id)
      }}
      tabBarOrder={tabBarOrder}
      hoveredTabInsertion={hoveredTabInsertion}
    />
  )

  // Why: pane-specific actions stay with the focused split, while the collapsed
  // workspace sidebar chrome is anchored once to the top-right split below.
  const focusedActionChromeClassName = cn(
    'shrink-0 overflow-hidden transition-[opacity] duration-150',
    isFocused ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 w-0'
  )
  // Why: the split wrapper already paints edge-touching seams; duplicating them
  // inside a pane makes the sidebar boundary look two pixels wide.
  const splitFrameClassName = hasSplitGroups
    ? cn(
        !(touchesLeftEdge || suppressLeftBorder) && 'border-l',
        !(touchesRightEdge || suppressRightBorder) && 'border-r',
        !(touchesBottomEdge || suppressBottomBorder) && 'border-b',
        'border-border',
        isFocused && !touchesBottomEdge && !suppressBottomBorder && 'border-b-accent',
        !isFocused && 'opacity-95'
      )
    : undefined
  return (
    <WorkspacePaneFrame
      worktreeId={worktreeId}
      stripId={groupId}
      tabBar={tabBar}
      trailingActions={
        <>
          {isFocused ? (
            <ButtonGroup presentation="titlebar" className={focusedActionChromeClassName}>
              <TabBarOpenInMenuButton worktreeId={worktreeId} />
              <TabBarQuickCommandsButton
                worktreeId={worktreeId}
                groupId={groupId}
                presentation="titlebar-icon"
                mergeNextSeam={!hasSplitGroups}
              />
              {hasSplitGroups ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="titlebar-segment"
                        size="icon-titlebar-wide"
                        seam="merge-next"
                        className="[-webkit-app-region:no-drag]"
                        aria-label={translate(
                          'auto.components.tab.group.TabGroupPanel.closePaneColumn',
                          'Close split pane'
                        )}
                        onClick={(event) => {
                          event.stopPropagation()
                          commands.closeGroup()
                        }}
                      >
                        <X />
                      </Button>
                    }
                  />
                  <TooltipContent side="bottom" sideOffset={6}>
                    {translate(
                      'auto.components.tab.group.TabGroupPanel.closePaneColumn',
                      'Close split pane'
                    )}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </ButtonGroup>
          ) : (
            <div className={cn('h-full', focusedActionChromeClassName)} />
          )}
          {reserveWindowControlsSpace ? <WorkspaceSidebarChromeSpacer /> : null}
        </>
      }
      trailingActionsConnected
      reserveCollapsedSidebarHeaderSpace={reserveCollapsedSidebarHeaderSpace}
      reserveWindowControlsSpace={reserveWindowControlsSpace}
      rootClassName={splitFrameClassName}
      rootProps={{
        onPointerDown: commands.focusGroup,
        onFocusCapture: commands.focusGroup
      }}
      bodyRef={setBodyDropRef}
      bodyProps={{
        'data-tab-group-body-id': groupId,
        'data-worktree-id': worktreeId,
        style: bodyAnchorStyle
      }}
    >
      {/* Why: this empty anchor lets the agent-sessions tour read as a
          terminal-area tip instead of attaching to toolbar chrome. */}
      {isFocused ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-1/4 h-px"
          data-contextual-tour-target="workspace-agent-terminal-tip"
        />
      ) : null}
      {activeTab &&
        activeTab.contentType !== 'terminal' &&
        activeTab.contentType !== 'browser' &&
        activeTab.contentType !== 'simulator' &&
        activeTab.contentType !== 'git-graph' && (
          <div className="absolute inset-0 flex min-h-0 min-w-0">
            {/* Why: split groups render editor content inside a plain relative pane body
                instead of the legacy flex column in Terminal.tsx. */}
            <Suspense
              fallback={
                <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
                  {translate(
                    'auto.components.tab.group.TabGroupPanel.814fb04c43',
                    'Loading editor...'
                  )}
                </div>
              }
            >
              <EditorPanel activeFileId={activeTab.entityId} activeViewStateId={activeTab.id} />
            </Suspense>
          </div>
        )}

      {activeTab?.contentType === 'git-graph' ? (
        <div className="absolute inset-0 flex min-h-0 min-w-0">
          <Suspense fallback={null}>
            <GitGraphView worktreeId={worktreeId} tabId={activeTab.id} />
          </Suspense>
        </div>
      ) : null}

      {/* Why: terminal/browser/simulator panes are rendered at the worktree level by
          overlay layers and absolutely positioned over this body element
          via the slot registered above. Rendering them per-group caused
          split moves to remount xterm, reparent Electron `<webview>`, or
          reload the simulator stream. */}
    </WorkspacePaneFrame>
  )
}
