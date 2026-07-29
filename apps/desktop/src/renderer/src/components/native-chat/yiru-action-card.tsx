import { ArrowSquareOut, TerminalWindow, WarningCircle } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'

import {
  focusRendererTerminalHandle,
  findTerminalHandleTarget
} from '../terminal-pane/terminal-handle-links'
import { findTerminalTabWorktreeId } from './file-link'
import type { YiruAction, YiruActionObject, YiruActionVerb } from './yiru-action'

export function NativeChatYiruActionCard({ action }: { action: YiruAction }): React.JSX.Element {
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
  const target = terminalTitle ?? action.target
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
      {canJump ? <ArrowSquareOut className="text-muted-foreground size-3.5 shrink-0" /> : null}
    </>
  )

  if (canJump) {
    return (
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => jumpToAction(action)}
        title={translate('components.native-chat.tool.yiru.openTarget', 'Open action target')}
        className="h-auto w-full justify-start gap-2 whitespace-normal"
      >
        {content}
      </Button>
    )
  }
  return (
    <div className="border-border bg-card flex w-full items-start gap-2 border px-3 py-2">
      {content}
    </div>
  )
}

function actionSummary(action: YiruAction, target: string | null): string {
  if (action.status === 'running') {
    return translate('components.native-chat.tool.yiru.running', 'Running {{value0}}', {
      value0: action.commandLabel
    })
  }
  if (action.status === 'error') {
    return translate('components.native-chat.tool.yiru.failed', '{{value0}} failed', {
      value0: action.commandLabel
    })
  }
  if (!action.verb || !action.object) {
    return action.commandLabel
  }
  const verb = actionVerb(action.verb)
  const object = actionObject(action.object)
  if (target && action.outcome) {
    return translate(
      'components.native-chat.tool.yiru.summaryOutcome',
      '{{value0}} {{value1}} {{value2}}, {{value3}}',
      { value0: verb, value1: object, value2: target, value3: actionOutcome(action.outcome) }
    )
  }
  if (target) {
    return translate(
      'components.native-chat.tool.yiru.summaryTarget',
      '{{value0}} {{value1}} {{value2}}',
      { value0: verb, value1: object, value2: target }
    )
  }
  return translate('components.native-chat.tool.yiru.summary', '{{value0}} {{value1}}', {
    value0: verb,
    value1: object
  })
}

function actionVerb(verb: YiruActionVerb): string {
  switch (verb) {
    case 'captured':
      return translate('components.native-chat.tool.yiru.verb.captured', 'Captured')
    case 'changed':
      return translate('components.native-chat.tool.yiru.verb.changed', 'Changed')
    case 'closed':
      return translate('components.native-chat.tool.yiru.verb.closed', 'Closed')
    case 'created':
      return translate('components.native-chat.tool.yiru.verb.created', 'Created')
    case 'dispatched':
      return translate('components.native-chat.tool.yiru.verb.dispatched', 'Dispatched')
    case 'focused':
      return translate('components.native-chat.tool.yiru.verb.focused', 'Focused')
    case 'inspected':
      return translate('components.native-chat.tool.yiru.verb.inspected', 'Inspected')
    case 'navigated':
      return translate('components.native-chat.tool.yiru.verb.navigated', 'Navigated')
    case 'read':
      return translate('components.native-chat.tool.yiru.verb.read', 'Read')
    case 'removed':
      return translate('components.native-chat.tool.yiru.verb.removed', 'Removed')
    case 'replied':
      return translate('components.native-chat.tool.yiru.verb.replied', 'Replied to')
    case 'ran':
      return translate('components.native-chat.tool.yiru.verb.ran', 'Ran')
    case 'sent-to':
      return translate('components.native-chat.tool.yiru.verb.sentTo', 'Sent to')
    case 'started':
      return translate('components.native-chat.tool.yiru.verb.started', 'Started')
    case 'stopped':
      return translate('components.native-chat.tool.yiru.verb.stopped', 'Stopped')
    case 'updated':
      return translate('components.native-chat.tool.yiru.verb.updated', 'Updated')
    case 'used':
      return translate('components.native-chat.tool.yiru.verb.used', 'Used')
    case 'waited':
      return translate('components.native-chat.tool.yiru.verb.waited', 'Waited for')
  }
}

function actionObject(object: YiruActionObject): string {
  switch (object) {
    case 'automation':
      return translate('components.native-chat.tool.yiru.object.automation', 'automation')
    case 'automations':
      return translate('components.native-chat.tool.yiru.object.automations', 'automations')
    case 'browser':
      return translate('components.native-chat.tool.yiru.object.browser', 'browser')
    case 'browser-tab':
      return translate('components.native-chat.tool.yiru.object.browserTab', 'browser tab')
    case 'computer':
      return translate('components.native-chat.tool.yiru.object.computer', 'computer')
    case 'message':
      return translate('components.native-chat.tool.yiru.object.message', 'message')
    case 'orchestration':
      return translate('components.native-chat.tool.yiru.object.orchestration', 'orchestration')
    case 'task':
      return translate('components.native-chat.tool.yiru.object.task', 'task')
    case 'tasks':
      return translate('components.native-chat.tool.yiru.object.tasks', 'tasks')
    case 'terminal':
      return translate('components.native-chat.tool.yiru.object.terminal', 'terminal')
    case 'terminals':
      return translate('components.native-chat.tool.yiru.object.terminals', 'terminals')
    case 'worktree':
      return translate('components.native-chat.tool.yiru.object.worktree', 'worktree')
    case 'worktrees':
      return translate('components.native-chat.tool.yiru.object.worktrees', 'worktrees')
  }
}

function actionOutcome(outcome: NonNullable<YiruAction['outcome']>): string {
  if (outcome.kind === 'spawned') {
    return translate('components.native-chat.tool.yiru.outcome.spawned', 'spawned {{value0}}', {
      value0: outcome.value
    })
  }
  return translate('components.native-chat.tool.yiru.outcome.to', 'to {{value0}}', {
    value0: outcome.value
  })
}

function jumpToAction(action: YiruAction): void {
  const { terminalHandle, tabId } = action.jumpTarget
  if (terminalHandle && focusRendererTerminalHandle(terminalHandle)) {
    return
  }
  const state = useAppStore.getState()
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
