import { FolderOpen, CaretDown } from '@phosphor-icons/react'

import {
  getLocalFileManagerLabel,
  getPreferredWorktreeOpenInEntry,
  getWorktreeOpenInEntries,
  openWorktreePath,
  type OpenInMenuEntry,
  WorktreeOpenInMenuContent
} from '@/components/sidebar/worktree-open-in-menu'
import type { DropIndicator } from '@/components/tab-bar/drop-indicator'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '@/store'
import { useRepoById } from '@/store/selectors'

import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID } from '../../../../shared/workspace-panel-titlebar-pinned'
import { getDropIndicatorClasses } from '../workspace-panel/titlebar-drop-indicator'
import type { WorkspacePanelTitlebarModel } from '../workspace-panel/use-workspace-panel-titlebar-model'

export type TabBarOpenInMenuButtonProps = {
  worktreeId: string
  /** When provided, Open in joins the titlebar pin/drag strip. */
  titlebarModel?: WorkspacePanelTitlebarModel | null
  titlebarIndex?: number
  titlebarSource?: 'visible' | 'overflow'
  dropIndicator?: DropIndicator
}

export function TabBarOpenInMenuButton({
  worktreeId,
  titlebarModel = null,
  titlebarIndex,
  titlebarSource = 'visible',
  dropIndicator = null
}: TabBarOpenInMenuButtonProps): React.JSX.Element | null {
  const worktree = useAppStore((state) => state.getKnownWorktreeById(worktreeId) ?? null)
  const repo = useRepoById(worktree?.repoId ?? null)
  const runtimeEnvironmentId = useAppStore((state) =>
    getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  )
  const openInApplications = useAppStore((state) => state.settings?.openInApplications ?? [])
  const lastOpenInTargetKey = useAppStore((state) => state.settings?.lastOpenInTargetKey)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const entries = getWorktreeOpenInEntries(openInApplications, getLocalFileManagerLabel())
  const preferredEntry = getPreferredWorktreeOpenInEntry(entries, lastOpenInTargetKey)

  if (!worktree || worktreeId === FLOATING_TERMINAL_WORKTREE_ID || !preferredEntry) {
    return null
  }

  const openLabel = translate(
    'auto.components.tab.bar.TabBarOpenInMenuButton.3f5d946e01',
    'Open in {{value0}}',
    { value0: preferredEntry.label }
  )
  const chooseLabel = translate(
    'auto.components.tab.bar.TabBarOpenInMenuButton.50ec9a165e',
    'Choose application'
  )

  const openEntry = (entry: OpenInMenuEntry): void => {
    void openWorktreePath({
      target: entry.target,
      worktreePath: worktree.path,
      connectionId: repo?.connectionId ?? null,
      runtimeEnvironmentId,
      command: entry.command
    })
  }

  const rememberEntry = (entry: OpenInMenuEntry): void => {
    if (entry.preferenceKey !== lastOpenInTargetKey) {
      // Why: the left half is a repeat action, so menu choices must survive relaunches.
      void updateSettings({ lastOpenInTargetKey: entry.preferenceKey })
    }
  }

  const pinDraggable = Boolean(titlebarModel)
  const startPinDrag = (event: React.PointerEvent): void => {
    if (!titlebarModel) {
      return
    }
    titlebarModel.handleItemPointerDown(event, WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID, titlebarSource)
  }

  return (
    // Why: Open in is two chrome buttons but one pin slot. The wrapper owns the
    // ButtonGroup L/R seams; inner buttons stay borderless so icon + caret read
    // as one control with no mid seam.
    <div
      data-workspace-titlebar-slot={titlebarIndex != null ? String(titlebarIndex) : undefined}
      className={cn(
        'relative flex h-full items-stretch border border-y-0 border-border [-webkit-app-region:no-drag] dark:border-input',
        pinDraggable && 'cursor-grab active:cursor-grabbing',
        getDropIndicatorClasses(dropIndicator)
      )}
      // Why: capture so Menu/Tooltip triggers cannot stopPropagation before the
      // pin drag session arms — otherwise Open in looks undraggable.
      onPointerDownCapture={pinDraggable ? startPinDrag : undefined}
    >
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline-transparent"
                size="icon-titlebar-compact"
                className="text-muted-foreground border-0"
                aria-label={openLabel}
                onClick={() => openEntry(preferredEntry)}
              >
                {preferredEntry.target === 'file-manager' ? (
                  <FolderOpen className="size-3.5" />
                ) : (
                  <OpenInApplicationIcon
                    application={{ command: preferredEntry.command ?? '' }}
                    size={14}
                  />
                )}
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {openLabel}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline-transparent"
                    size="icon-titlebar-compact"
                    className="text-muted-foreground border-0"
                    aria-label={chooseLabel}
                  >
                    {/* Why: the compact chooser affordance is intentionally quieter than menu icons. */}
                    <CaretDown className="size-3" weight="regular" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {chooseLabel}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-52">
          <WorktreeOpenInMenuContent
            worktreePath={worktree.path}
            connectionId={repo?.connectionId ?? null}
            runtimeEnvironmentId={runtimeEnvironmentId}
            onEntryOpen={rememberEntry}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
