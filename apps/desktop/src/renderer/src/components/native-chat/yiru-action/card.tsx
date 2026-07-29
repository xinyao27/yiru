import { ArrowSquareOut, TerminalWindow, WarningCircle } from '@phosphor-icons/react'

import {
  focusRendererTerminalHandle,
  findTerminalHandleTarget
} from '@/components/terminal-pane/terminal-handle-links'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'

import { findTerminalTabWorktreeId } from '../file-link'
import type { YiruAction } from './action'
import { actionSummary } from './summary'

type ActionCardProps = {
  action: YiruAction
}

export function ActionCard(props: ActionCardProps): React.JSX.Element {
  const { action } = props
  const terminalTitle = useAppStore((state) => {
    const handle = action.jumpTarget.terminalHandle
    if (!handle) {
      return null
    }
    const target = findTerminalHandleTarget(handle, state)
    const tab = target
      ? state.tabsByWorktree[target.worktreeId]?.find((candidate) => candidate.id === target.tabId)
      : null
    return tab?.customTitle?.trim() || tab?.title?.trim() || null
  })
  const target = action.object === 'terminal' ? (terminalTitle ?? action.target) : action.target
  const summary = actionSummary(action, target)
  const canJump = Object.values(action.jumpTarget).some(Boolean)
  const content = (
    <>
      {action.status === 'error' ? (
        <WarningCircle className="text-destructive mt-0.5 size-4 shrink-0" />
      ) : (
        <TerminalWindow className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        <span className="text-foreground block text-left text-xs font-medium">{summary}</span>
        <code className="text-muted-foreground block truncate text-left font-mono text-[11px]">
          {action.commandLabel}
        </code>
        {action.errorMessage ? (
          <span className="text-destructive mt-0.5 block text-left text-[11px]">
            {action.errorMessage}
          </span>
        ) : null}
      </span>
      {canJump ? (
        <ArrowSquareOut weight="regular" className="text-muted-foreground size-3.5 shrink-0" />
      ) : null}
    </>
  )

  if (canJump) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="list-row"
              type="button"
              onClick={() => jumpToAction(action)}
              className="w-full justify-start gap-2 whitespace-normal"
            >
              {content}
            </Button>
          }
        />
        <TooltipContent side="top" sideOffset={4}>
          {translate('components.native-chat.tool.yiru.openTarget', 'Open action target')}
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <div className="border-border bg-card flex w-full items-start gap-2 border px-3 py-2">
      {content}
    </div>
  )
}

function jumpToAction(action: YiruAction): void {
  const { browserPageId, terminalHandle, tabId } = action.jumpTarget
  if (terminalHandle && focusRendererTerminalHandle(terminalHandle)) {
    return
  }
  const state = useAppStore.getState()
  if (browserPageId) {
    const browserWorktreeId =
      action.jumpTarget.worktreeId ?? findBrowserPageWorktreeId(browserPageId)
    if (browserWorktreeId && activateAndRevealWorktree(browserWorktreeId)) {
      useAppStore.getState().focusBrowserTabInWorktree(browserWorktreeId, browserPageId)
    }
    return
  }
  const worktreeId =
    action.jumpTarget.worktreeId ??
    (tabId ? findTerminalTabWorktreeId(state.tabsByWorktree, tabId) : null)
  if (!worktreeId || !activateAndRevealWorktree(worktreeId)) {
    return
  }
  if (tabId) {
    const nextState = useAppStore.getState()
    nextState.setActiveTab(tabId)
    nextState.setActiveTabType('terminal')
    focusTerminalTabSurface(tabId)
  }
}

function findBrowserPageWorktreeId(browserPageId: string): string | null {
  const { browserTabsByWorktree } = useAppStore.getState()
  for (const [worktreeId, workspaces] of Object.entries(browserTabsByWorktree)) {
    if (workspaces.some((workspace) => workspace.pageIds?.includes(browserPageId))) {
      return worktreeId
    }
  }
  return null
}
