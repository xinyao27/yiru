import { TERMINAL_QUICK_COMMANDS_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/capabilities'
import type { TuiAgent } from '@yiru/workbench-model/agent'
import {
  applyTerminalQuickCommandMutation,
  flattenTerminalQuickCommand,
  isTerminalAgentQuickCommand,
  MAX_QUICK_COMMANDS,
  MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH,
  MAX_QUICK_COMMAND_LABEL_LENGTH,
  MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH,
  parseNormalizedTerminalQuickCommands,
  supportsTerminalAgentQuickCommand,
  terminalQuickCommandMatchesRepo,
  type TerminalQuickCommand,
  type TerminalQuickCommandMutation
} from '@yiru/workbench-model/ui'

import { MOBILE_TUI_AGENT_LABELS } from '../workspace-create/mobile-tui-agents'

export {
  applyTerminalQuickCommandMutation,
  isTerminalAgentQuickCommand as isAgentQuickCommand,
  MAX_QUICK_COMMANDS,
  MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH,
  MAX_QUICK_COMMAND_LABEL_LENGTH,
  MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH,
  parseNormalizedTerminalQuickCommands,
  supportsTerminalAgentQuickCommand,
  terminalQuickCommandMatchesRepo as quickCommandMatchesRepo,
  type TerminalQuickCommandMutation
}

const MAX_QUICK_COMMAND_DISPLAY_PREVIEW_LENGTH = 240

export function supportsMobileQuickCommands(capabilities: readonly string[] | undefined): boolean {
  return capabilities?.includes(TERMINAL_QUICK_COMMANDS_RUNTIME_CAPABILITY) === true
}

export function shouldShowMobileQuickCommandsAction(supported: boolean | null): boolean {
  // Why: an unresolved probe must not shift tab chrome; only a completed
  // legacy-host verdict removes the action.
  return supported !== false
}

export type MobileQuickCommandLaunch = {
  agent?: TuiAgent
  options: {
    agentPrompt?: string
    startupCommand?: string
    startupCommandDelivery?: 'shell-ready'
    initialPrompt?: string
    enter?: boolean
    successToast?: string
  }
}

export function buildMobileQuickCommandLaunch(
  command: TerminalQuickCommand
): MobileQuickCommandLaunch | null {
  if (isTerminalAgentQuickCommand(command)) {
    return command.prompt.trim() && supportsTerminalAgentQuickCommand(command.agent)
      ? { agent: command.agent, options: { agentPrompt: command.prompt } }
      : null
  }
  if (!command.command.trim()) {
    return null
  }
  if (command.appendEnter === false) {
    return {
      options: {
        initialPrompt: command.command,
        enter: false,
        successToast: `${command.label.trim() || 'Quick command'} inserted`
      }
    }
  }
  // Why: shell-ready delivery avoids racing native, WSL, and SSH shell startup;
  // flattening matches the desktop behavior for multiline saved commands.
  return {
    options: {
      startupCommand: flattenTerminalQuickCommand(command).command,
      startupCommandDelivery: 'shell-ready'
    }
  }
}

export function getQuickCommandAgentLabel(agent: TuiAgent): string {
  return MOBILE_TUI_AGENT_LABELS[agent] ?? agent
}

export function getQuickCommandPreview(command: TerminalQuickCommand): string {
  return isTerminalAgentQuickCommand(command)
    ? `${getQuickCommandAgentLabel(command.agent)}: ${command.prompt}`
    : command.command
}

export function getQuickCommandDisplayPreview(command: TerminalQuickCommand): string {
  const preview = getQuickCommandPreview(command)
  return preview.length <= MAX_QUICK_COMMAND_DISPLAY_PREVIEW_LENGTH
    ? preview
    : `${preview.slice(0, MAX_QUICK_COMMAND_DISPLAY_PREVIEW_LENGTH - 1)}…`
}
