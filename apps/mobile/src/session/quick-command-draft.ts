import type { TuiAgent } from '@yiru/workbench-model/agent'
import type {
  TerminalQuickCommand,
  TerminalQuickCommandAction,
  TerminalQuickCommandScope
} from '@yiru/workbench-model/ui'

import {
  isAgentQuickCommand,
  MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH,
  MAX_QUICK_COMMAND_LABEL_LENGTH,
  MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH,
  supportsTerminalAgentQuickCommand
} from '../terminal/quick-commands'

// Why: retain both action bodies while toggling so users do not lose partially
// entered command or prompt text before saving.
export type QuickCommandDraft = {
  id: string | null
  label: string
  action: TerminalQuickCommandAction
  command: string
  appendEnter: boolean
  agent: TuiAgent | null
  prompt: string
  scope: TerminalQuickCommandScope
}

export function createEmptyQuickCommandDraft(scope: TerminalQuickCommandScope): QuickCommandDraft {
  return {
    id: null,
    label: '',
    action: 'terminal-command',
    command: '',
    appendEnter: true,
    agent: null,
    prompt: '',
    scope
  }
}

export function quickCommandToDraft(command: TerminalQuickCommand): QuickCommandDraft {
  const scope: TerminalQuickCommandScope =
    command.scope?.type === 'repo' && command.scope.repoId
      ? { type: 'repo', repoId: command.scope.repoId }
      : { type: 'global' }
  return isAgentQuickCommand(command)
    ? {
        id: command.id,
        label: command.label,
        action: 'agent-prompt',
        command: '',
        appendEnter: true,
        agent: command.agent,
        prompt: command.prompt,
        scope
      }
    : {
        id: command.id,
        label: command.label,
        action: 'terminal-command',
        command: command.command,
        appendEnter: command.appendEnter !== false,
        agent: null,
        prompt: '',
        scope
      }
}

export function isQuickCommandDraftValid(draft: QuickCommandDraft): boolean {
  if (!draft.label.trim()) {
    return false
  }
  return draft.action === 'agent-prompt'
    ? Boolean(
        draft.agent &&
        supportsTerminalAgentQuickCommand(draft.agent) &&
        draft.prompt.trim().length > 0
      )
    : draft.command.trim().length > 0
}

export function draftToQuickCommand(draft: QuickCommandDraft): TerminalQuickCommand | null {
  if (!isQuickCommandDraftValid(draft)) {
    return null
  }
  // Why: timestamps alone collide when desktop and mobile add in the same
  // millisecond, which would turn a targeted upsert into an overwrite.
  const id =
    draft.id ??
    `quick-command-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const label = draft.label.trim().slice(0, MAX_QUICK_COMMAND_LABEL_LENGTH)
  return draft.action === 'agent-prompt' && draft.agent
    ? {
        id,
        label,
        action: 'agent-prompt',
        agent: draft.agent,
        prompt: draft.prompt.trimEnd().slice(0, MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH),
        scope: draft.scope
      }
    : {
        id,
        label,
        action: 'terminal-command',
        command: draft.command.trimEnd().slice(0, MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH),
        appendEnter: draft.appendEnter,
        scope: draft.scope
      }
}
