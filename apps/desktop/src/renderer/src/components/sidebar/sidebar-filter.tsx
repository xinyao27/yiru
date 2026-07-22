import {
  Check,
  GitBranch,
  Funnel as ListFilter,
  Moon,
  HardDrives as Server,
  FolderPlus,
  FlowArrow as Workflow
} from '@phosphor-icons/react'
import React, { useCallback, useMemo, useState } from 'react'

import RepoBadgeLabel from '@/components/repo/repo-badge-label'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { searchRepos } from '@/lib/repo-search'
import { useAppStore } from '@/store'

import { DEFAULT_SHOW_SLEEPING_WORKSPACES } from '../../../../shared/constants'

type SidebarFilterProps = {
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
  contentSide?: 'top' | 'right' | 'bottom' | 'left'
  onMenuOpenChange?: (open: boolean) => void
}

const SidebarFilter = React.memo(function SidebarFilter({
  tooltipSide = 'bottom',
  contentSide = 'right',
  onMenuOpenChange
}: SidebarFilterProps) {
  const showSleepingWorkspaces = useAppStore((s) => s.showSleepingWorkspaces)
  const setShowSleepingWorkspaces = useAppStore((s) => s.setShowSleepingWorkspaces)
  // Surface the user-assigned shortcut here so the filter menu doubles as its
  // discovery point ('Unassigned' until they bind one in Settings → Shortcuts).
  const sleepingShortcut = useShortcutLabel('sidebar.sleepingWorkspaces.toggle')
  const hideDefaultBranchWorkspace = useAppStore((s) => s.hideDefaultBranchWorkspace)
  const setHideDefaultBranchWorkspace = useAppStore((s) => s.setHideDefaultBranchWorkspace)
  const hideAutomationGeneratedWorkspaces = useAppStore((s) => s.hideAutomationGeneratedWorkspaces)
  const setHideAutomationGeneratedWorkspaces = useAppStore(
    (s) => s.setHideAutomationGeneratedWorkspaces
  )
  const filterRepoIds = useAppStore((s) => s.filterRepoIds)
  const setFilterRepoIds = useAppStore((s) => s.setFilterRepoIds)
  const repos = useAppStore((s) => s.repos)
  const addRepo = useAppStore((s) => s.addRepo)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [commandValueOverride, setCommandValueOverride] = useState<string | null>(null)

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      onMenuOpenChange?.(next)
      if (!next) {
        setQuery('')
      }
    },
    [onMenuOpenChange]
  )

  const handleToggleRepo = useCallback(
    (repoId: string) => {
      setFilterRepoIds(
        filterRepoIds.includes(repoId)
          ? filterRepoIds.filter((id) => id !== repoId)
          : [...filterRepoIds, repoId]
      )
    },
    [filterRepoIds, setFilterRepoIds]
  )

  const canFilterRepos = repos.length > 1
  // Why: derive from current repos so stale ids (e.g. lingering after a repo
  // is removed) don't inflate counts or falsely signal an applied filter.
  const selectedRepoIdSet = useMemo(() => {
    const set = new Set<string>()
    for (const r of repos) {
      if (filterRepoIds.includes(r.id)) {
        set.add(r.id)
      }
    }
    return set
  }, [repos, filterRepoIds])
  const selectedCount = selectedRepoIdSet.size
  const hasRepoFilter = selectedCount > 0
  const hasSleepingFilter = showSleepingWorkspaces !== DEFAULT_SHOW_SLEEPING_WORKSPACES
  const hasAnyFilter =
    hasSleepingFilter ||
    hideDefaultBranchWorkspace ||
    hideAutomationGeneratedWorkspaces ||
    hasRepoFilter
  const activeFilterCount =
    (hasSleepingFilter ? 1 : 0) +
    (hideDefaultBranchWorkspace ? 1 : 0) +
    (hideAutomationGeneratedWorkspaces ? 1 : 0) +
    selectedCount

  const filteredRepos = useMemo(() => searchRepos(repos, query), [repos, query])
  const commandValue =
    commandValueOverride && filteredRepos.some((repo) => repo.id === commandValueOverride)
      ? commandValueOverride
      : (filteredRepos[0]?.id ?? '')
  const allSelected = canFilterRepos && selectedCount === repos.length

  const clearAll = useCallback(() => {
    setShowSleepingWorkspaces(DEFAULT_SHOW_SLEEPING_WORKSPACES)
    setHideDefaultBranchWorkspace(false)
    setHideAutomationGeneratedWorkspaces(false)
    setFilterRepoIds([])
  }, [
    setShowSleepingWorkspaces,
    setHideDefaultBranchWorkspace,
    setHideAutomationGeneratedWorkspaces,
    setFilterRepoIds
  ])

  // Why: derive ids from the live repos list at click time so a repo added
  // while the popover is open is included immediately.
  const selectAllRepos = useCallback(() => {
    setFilterRepoIds(repos.map((r) => r.id))
  }, [repos, setFilterRepoIds])

  const clearRepos = useCallback(() => setFilterRepoIds([]), [setFilterRepoIds])

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  type="button"
                  aria-label={
                    hasAnyFilter
                      ? translate(
                          'auto.components.sidebar.SidebarFilter.75405270ed',
                          'Edit filters ({{value0}} active)',
                          { value0: activeFilterCount }
                        )
                      : translate(
                          'auto.components.sidebar.SidebarFilter.f506a1262a',
                          'Filter workspaces'
                        )
                  }
                  className="text-muted-foreground relative"
                >
                  <ListFilter className="size-3.5" strokeWidth={2.25} />
                  {hasAnyFilter && (
                    // Why: the only at-a-glance affordance that filters are
                    // applied — without it the list can silently hide workspaces.
                    <span
                      aria-hidden
                      className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full px-0.5 text-[9px] leading-none font-medium"
                    >
                      {activeFilterCount > 9 ? '9+' : activeFilterCount}
                    </span>
                  )}
                </Button>
              }
            />
          }
        />
        <TooltipContent side={tooltipSide} sideOffset={6}>
          {hasAnyFilter
            ? translate('auto.components.sidebar.SidebarFilter.ee240a39eb', 'Edit filters')
            : translate('auto.components.sidebar.SidebarFilter.f506a1262a', 'Filter workspaces')}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side={contentSide} align="start" sideOffset={8} className="w-72">
        <FilterToggleRow
          icon={<Moon className="size-3.5" />}
          label={translate('auto.components.sidebar.SidebarFilter.638a2d221d', 'Hide sleeping')}
          checked={!showSleepingWorkspaces}
          onChange={(hideSleeping) => setShowSleepingWorkspaces(!hideSleeping)}
          shortcutLabel={sleepingShortcut === 'Unassigned' ? undefined : sleepingShortcut}
        />
        <FilterToggleRow
          icon={<GitBranch className="size-3.5" />}
          label={translate(
            'auto.components.sidebar.SidebarFilter.e5cb32a898',
            'Hide default branch'
          )}
          checked={hideDefaultBranchWorkspace}
          onChange={setHideDefaultBranchWorkspace}
        />
        <FilterToggleRow
          icon={<Workflow className="size-3.5" />}
          label={translate(
            'auto.components.sidebar.SidebarFilter.automationCreated',
            'Hide automation-created'
          )}
          checked={hideAutomationGeneratedWorkspaces}
          onChange={setHideAutomationGeneratedWorkspaces}
        />

        {canFilterRepos && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                {translate('auto.components.sidebar.SidebarFilter.5f7085a077', 'Projects')}
                {hasRepoFilter && (
                  <span className="text-foreground ml-1.5 font-medium tracking-normal normal-case">
                    · {selectedCount}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={selectAllRepos}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full px-2 py-0.5 text-[11px] focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
                  disabled={allSelected}
                >
                  {translate('auto.components.sidebar.SidebarFilter.139877b384', 'Select all')}
                </button>
                <button
                  type="button"
                  onClick={clearRepos}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full px-2 py-0.5 text-[11px] focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
                  disabled={!hasRepoFilter}
                >
                  {translate('auto.components.sidebar.SidebarFilter.779b7ba05d', 'Clear')}
                </button>
              </div>
            </div>

            <Command
              shouldFilter={false}
              value={commandValue}
              onValueChange={setCommandValueOverride}
              className="bg-transparent"
            >
              <CommandInput
                autoFocus
                placeholder={translate(
                  'auto.components.sidebar.SidebarFilter.489d1c8c9f',
                  'Search projects...'
                )}
                value={query}
                onValueChange={(nextQuery) => {
                  // Why: typing creates a new filtered list, so keyboard
                  // selection should return to the derived first match.
                  setCommandValueOverride(null)
                  setQuery(nextQuery)
                }}
                onKeyDown={(event) => event.stopPropagation()}
                className="h-8 py-2 text-xs"
                wrapperClassName="mx-1 rounded-[7px] border border-border/70 px-2"
                iconClassName="h-3.5 w-3.5"
              />
              <CommandList className="max-h-64 py-1">
                <CommandEmpty className="py-4 text-[11px]">
                  {translate(
                    'auto.components.sidebar.SidebarFilter.b9e8802e73',
                    'No projects match'
                  )}
                </CommandEmpty>
                {filteredRepos.map((r) => {
                  const checked = selectedRepoIdSet.has(r.id)
                  return (
                    <CommandItem
                      key={r.id}
                      value={r.id}
                      onSelect={() => handleToggleRepo(r.id)}
                      className="mx-1 my-0.5 items-center gap-2 rounded-[7px] px-2 py-1 text-[12px] leading-5 font-medium data-[selected=true]:bg-black/8 dark:data-[selected=true]:bg-white/14"
                    >
                      <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
                        <RepoBadgeLabel
                          name={r.displayName}
                          color={r.badgeColor}
                          className="max-w-full"
                        />
                        {r.connectionId && (
                          <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[9px] leading-none font-medium">
                            <Server className="size-2.5" />
                            {translate('auto.components.sidebar.SidebarFilter.81ded53722', 'SSH')}
                          </span>
                        )}
                      </span>
                      {checked && (
                        <Check className="text-primary size-3 shrink-0" strokeWidth={3} />
                      )}
                    </CommandItem>
                  )
                })}
              </CommandList>
            </Command>
          </>
        )}

        <DropdownMenuSeparator />
        {/* Why: "Add project" stays visible regardless of project count so users
            can recover from the 0/1-project state where the project section is
            hidden. Reset sits beside it only when a filter is active. */}
        <div className="flex items-center justify-between gap-1 px-1 py-1">
          {hasAnyFilter ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-[5px] px-2 py-1 text-[11px] focus-visible:outline-none"
            >
              {translate('auto.components.sidebar.SidebarFilter.92a23e6d07', 'Reset filters')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => addRepo()}
            className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-[11px] focus-visible:outline-none"
          >
            <FolderPlus className="size-3.5" />
            {translate('auto.components.sidebar.SidebarFilter.e3b3898218', 'Add project')}
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

function FilterToggleRow({
  icon,
  label,
  checked,
  onChange,
  shortcutLabel
}: {
  icon: React.ReactNode
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  shortcutLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="hover:bg-muted flex w-full items-center justify-between gap-2 rounded-[5px] px-2 py-1.5 text-[12px] font-medium focus-visible:outline-none"
    >
      <span className="text-foreground inline-flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </span>
      <span className="inline-flex items-center gap-2">
        {shortcutLabel ? <DropdownMenuShortcut>{shortcutLabel}</DropdownMenuShortcut> : null}
        <span
          aria-hidden
          className={cn(
            'relative h-3.5 w-6 shrink-0 rounded-full transition-colors',
            checked ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 size-2.5 rounded-full bg-background   transition-transform',
              checked && 'translate-x-2.5'
            )}
          />
        </span>
      </span>
    </button>
  )
}

export default SidebarFilter
