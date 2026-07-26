import type React from 'react'
import { useCallback, useDeferredValue, useState } from 'react'

import { CommandDialog, CommandInput, CommandList } from '@/components/ui/command'
import { getNextWorktreePaletteSelection } from '@/components/worktree-jump-palette/worktree-palette-create-action'
import { translate } from '@/i18n/i18n'

import { FooterKey } from './palette-parts'
import { PaletteResultsList } from './rows/palette-list'
import { useSelectJumpTargetHandlers } from './select-jump-target'
import { useSelectSecondaryTargetHandlers } from './select-secondary-target'
import type { PaletteItem } from './types'
import { useBrowserFocusRestore } from './use-browser-focus-restore'
import { useCreateWorktreeAction } from './use-create-worktree-action'
import { useOpenTabsSearch } from './use-open-tabs-search'
import { usePaletteHostOptions } from './use-palette-host-options'
import { usePaletteLifecycle } from './use-palette-lifecycle'
import { usePaletteList } from './use-palette-list'
import { usePaletteSecondaryResults } from './use-palette-secondary-results'
import { usePaletteStoreState } from './use-palette-store-state'
import { useProjectTargetItems } from './use-project-target-items'
import { useQuickActionContext } from './use-quick-action-context'
import { useWorktreeSearch } from './use-worktree-search'

export default function WorktreeJumpPalette(): React.JSX.Element | null {
  const storeState = usePaletteStoreState()

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [selectedItemId, setSelectedItemId] = useState('')
  const hasQuery = deferredQuery.trim().length > 0

  const { focusFallbackSurface, requestBrowserFocus } = useBrowserFocusRestore()

  const lifecycle = usePaletteLifecycle({
    ...storeState,
    setQuery,
    setSelectedItemId,
    focusFallbackSurface,
    requestBrowserFocus
  })

  const hostOptions = usePaletteHostOptions(storeState)
  const worktreeSearch = useWorktreeSearch({
    ...storeState,
    ...hostOptions,
    hasQuery,
    deferredQuery
  })
  const openTabsSearch = useOpenTabsSearch({
    ...storeState,
    ...hostOptions,
    ...worktreeSearch,
    deferredQuery
  })
  const projectTargets = useProjectTargetItems({ ...storeState, hasQuery, deferredQuery })
  const quickActionCtx = useQuickActionContext({
    ...storeState,
    activeGroupSnapshotRef: lifecycle.activeGroupSnapshotRef
  })
  const secondaryResults = usePaletteSecondaryResults({
    ...storeState,
    deferredQuery,
    quickActionContext: quickActionCtx.quickActionContext
  })
  const paletteList = usePaletteList({
    hasQuery,
    deferredQuery,
    canCreateWorktree: hostOptions.canCreateWorktree,
    worktreeItems: worktreeSearch.worktreeItems,
    projectTargetItems: projectTargets.projectTargetItems,
    middleItems: secondaryResults.middleItems,
    openTabItems: openTabsSearch.openTabItems
  })

  const commandSelectedItemId = getNextWorktreePaletteSelection({
    currentSelectedItemId: selectedItemId,
    queryChanged: false,
    selectableItemIds: paletteList.selectionItemIds,
    showCreateAction: paletteList.showCreateAction
  })

  const { handleCreateWorktree } = useCreateWorktreeAction({
    ...storeState,
    ...hostOptions,
    ...quickActionCtx,
    ...lifecycle,
    createWorktreeName: paletteList.createWorktreeName,
    commandSelectedItemId
  })

  const {
    handleSelectWorktree,
    handleSelectBrowserPage,
    handleSelectSimulatorTab,
    handleSelectWorkspaceTab
  } = useSelectJumpTargetHandlers({
    ...storeState,
    ...lifecycle,
    focusFallbackSurface,
    requestBrowserFocus,
    setSelectedItemId
  })

  const { handleSelectSettings, handleSelectQuickAction, handleSelectProjectTarget } =
    useSelectSecondaryTargetHandlers({
      ...storeState,
      ...lifecycle,
      setSelectedItemId,
      buildQuickActionContext: quickActionCtx.buildQuickActionContext,
      focusFallbackSurface,
      requestBrowserFocus
    })

  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery)
      setSelectedItemId('')
      lifecycle.listRef.current?.scrollTo(0, 0)
    },
    [lifecycle.listRef]
  )

  const handleCloseAutoFocus = useCallback((e: Event) => {
    e.preventDefault()
  }, [])

  const handleOpenAutoFocus = useCallback((_event: Event) => {
    // No-op: address-bar detection is handled in the visible effect before
    // Radix steals focus. This callback exists only to satisfy the prop API.
  }, [])

  const handleSelectItem = useCallback(
    (item: PaletteItem) => {
      if (item.type === 'worktree') {
        handleSelectWorktree(item.worktree.id)
      } else if (item.type === 'project-target') {
        handleSelectProjectTarget(item.result)
      } else if (item.type === 'browser-page') {
        handleSelectBrowserPage(item.result)
      } else if (item.type === 'simulator-tab') {
        handleSelectSimulatorTab(item.result)
      } else if (item.type === 'workspace-tab') {
        handleSelectWorkspaceTab(item.result)
      } else if (item.type === 'settings') {
        handleSelectSettings(item.result)
      } else {
        handleSelectQuickAction(item.result)
      }
    },
    [
      handleSelectBrowserPage,
      handleSelectProjectTarget,
      handleSelectQuickAction,
      handleSelectSettings,
      handleSelectSimulatorTab,
      handleSelectWorkspaceTab,
      handleSelectWorktree
    ]
  )

  const resultCount = paletteList.selectableItems.length
  const emptyState = (() => {
    if (
      (worktreeSearch.hasAnySearchableWorktrees ||
        projectTargets.hasAnyProjectSearchCandidates ||
        secondaryResults.hasAnyMiddleResults ||
        openTabsSearch.hasAnyOpenTabs) &&
      hasQuery
    ) {
      return {
        title: translate(
          'auto.components.WorktreeJumpPalette.dbd9d87eec',
          'No results match your search'
        ),
        subtitle: translate(
          'auto.components.WorktreeJumpPalette.c4afa68159',
          'Try a worktree, project, setting, action, tab title, agent prompt, URL, PR, or port.'
        )
      }
    }
    // Why: empty-query rows exclude the current worktree, so a single-worktree
    // setup has hasAnyWorktrees=true but zero switchable rows. Without this
    // branch the palette would claim "No active worktrees" while one is open
    // — misleading. See docs/cmd-j-empty-query-ordering.md.
    if (!hasQuery && worktreeSearch.hasAnyWorktrees && !openTabsSearch.hasAnyOpenTabs) {
      return {
        title: translate(
          'auto.components.WorktreeJumpPalette.f60f8730be',
          'No other worktrees to switch to'
        ),
        subtitle: translate(
          'auto.components.WorktreeJumpPalette.b781ae05e3',
          'Type to search worktrees, settings, tabs, and actions.'
        )
      }
    }
    return {
      title: translate(
        'auto.components.WorktreeJumpPalette.1628fd7dfa',
        'No active worktrees, settings, actions, or open tabs'
      ),
      subtitle: translate(
        'auto.components.WorktreeJumpPalette.f7fda8d562',
        'Create a worktree or open a tab in Yiru to get started.'
      )
    }
  })()

  return (
    // Why: modal backdrops intentionally use alpha to preserve page context
    // while separating the command palette from the workspace beneath it.
    <CommandDialog
      open={storeState.visible}
      onOpenChange={lifecycle.handleOpenChange}
      shouldFilter={false}
      density="compact"
      onOpenAutoFocus={handleOpenAutoFocus}
      onCloseAutoFocus={handleCloseAutoFocus}
      title={translate('auto.components.WorktreeJumpPalette.4ee378034d', 'Jump to...')}
      description={translate(
        'auto.components.WorktreeJumpPalette.4e4ff044d5',
        'Search worktrees, settings, tabs, and actions'
      )}
      overlayClassName="bg-black/55 backdrop-blur-[2px]"
      contentClassName="top-[13%] w-[736px] max-w-[94vw] overflow-hidden border border-border/70 bg-background"
      commandProps={{
        loop: true,
        value: commandSelectedItemId,
        onValueChange: setSelectedItemId,
        className: 'bg-transparent'
      }}
    >
      <CommandInput
        size="sm"
        variant="inset"
        placeholder={translate(
          'auto.components.WorktreeJumpPalette.1ebe225fee',
          'Search worktrees, settings, tabs, and actions...'
        )}
        value={query}
        onValueChange={handleQueryChange}
        wrapperClassName="mx-2 mt-2"
      />
      <CommandList ref={lifecycle.listRef} className="max-h-[min(460px,62vh)] px-1.5 pt-2 pb-2.5">
        <PaletteResultsList
          isLoading={worktreeSearch.isLoading}
          resultCount={resultCount}
          showCreateAction={paletteList.showCreateAction}
          listEntries={paletteList.listEntries}
          createWorktreeName={paletteList.createWorktreeName}
          emptyState={emptyState}
          repoMap={hostOptions.repoMap}
          hostOptions={hostOptions.hostOptions}
          worktreeMap={worktreeSearch.worktreeMap}
          tabsByWorktree={storeState.tabsByWorktree}
          browserTabsByWorktree={storeState.browserTabsByWorktree}
          ptyIdsByTabId={storeState.ptyIdsByTabId}
          runtimePaneTitlesByTabId={storeState.runtimePaneTitlesByTabId}
          liveAgentStatusByWorktreeId={worktreeSearch.liveAgentStatusByWorktreeId}
          activeWorktreeId={storeState.activeWorktreeId}
          sshConnectionStates={storeState.sshConnectionStates}
          onSelectItem={handleSelectItem}
          onCreateWorktree={handleCreateWorktree}
        />
      </CommandList>
      <div className="border-border/60 text-muted-foreground/82 flex items-center justify-end border-t px-3.5 py-2.5 text-[11px]">
        <div className="flex items-center gap-2">
          <FooterKey>
            {translate('auto.components.WorktreeJumpPalette.f65d992a11', 'Enter')}
          </FooterKey>
          <span>{translate('auto.components.WorktreeJumpPalette.45def60329', 'Open')}</span>
          <FooterKey>
            {translate('auto.components.WorktreeJumpPalette.66b5a67bee', 'Esc')}
          </FooterKey>
          <span>{translate('auto.components.WorktreeJumpPalette.75499e01d9', 'Close')}</span>
          <FooterKey>↑↓</FooterKey>
          <span>{translate('auto.components.WorktreeJumpPalette.ac037cfac2', 'Move')}</span>
        </div>
      </div>
      <div aria-live="polite" className="sr-only">
        {deferredQuery.trim()
          ? translate(
              'auto.components.WorktreeJumpPalette.bb72c08e63',
              '{{value0}} results found{{value1}}',
              {
                value0: resultCount,
                value1: paletteList.showCreateAction ? ', create worktree action available' : ''
              }
            )
          : translate(
              'auto.components.WorktreeJumpPalette.20af998bff',
              '{{value0}} items available{{value1}}',
              {
                value0: resultCount,
                value1: paletteList.showCreateAction ? ', create worktree action available' : ''
              }
            )}
      </div>
    </CommandDialog>
  )
}
