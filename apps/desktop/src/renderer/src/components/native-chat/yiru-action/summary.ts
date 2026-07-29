import { translate } from '@/i18n/i18n'

import type { ActionObject, ActionVerb, YiruAction } from './action'

export function actionSummary(action: YiruAction, target: string | null): string {
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

function actionVerb(verb: ActionVerb): string {
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

function actionObject(object: ActionObject): string {
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
    case 'gate':
      return translate('components.native-chat.tool.yiru.object.gate', 'gate')
    case 'gates':
      return translate('components.native-chat.tool.yiru.object.gates', 'gates')
    case 'message':
      return translate('components.native-chat.tool.yiru.object.message', 'message')
    case 'messages':
      return translate('components.native-chat.tool.yiru.object.messages', 'messages')
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
