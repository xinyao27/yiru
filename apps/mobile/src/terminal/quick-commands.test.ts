import type { TerminalQuickCommand } from '@yiru/workbench-model/ui'
import { describe, expect, it } from 'vite-plus/test'

import {
  buildMobileQuickCommandLaunch,
  getQuickCommandDisplayPreview,
  getQuickCommandPreview,
  shouldShowMobileQuickCommandsAction,
  supportsMobileQuickCommands
} from './quick-commands'

function command(overrides: Partial<TerminalQuickCommand> = {}): TerminalQuickCommand {
  return {
    id: 'command',
    label: 'Command',
    action: 'terminal-command',
    command: 'pnpm test',
    appendEnter: true,
    scope: { type: 'global' },
    ...overrides
  } as TerminalQuickCommand
}

describe('mobile quick-command launch', () => {
  it('keeps the action stable while capability support is loading', () => {
    expect(shouldShowMobileQuickCommandsAction(null)).toBe(true)
    expect(shouldShowMobileQuickCommandsAction(true)).toBe(true)
    expect(shouldShowMobileQuickCommandsAction(false)).toBe(false)
  })

  it('requires the complete host capability', () => {
    expect(supportsMobileQuickCommands(undefined)).toBe(false)
    expect(supportsMobileQuickCommands(['terminal.binary-stream.v1'])).toBe(false)
    expect(supportsMobileQuickCommands(['terminal.quick-commands.v1'])).toBe(true)
  })

  it('uses shell-ready delivery for runnable commands', () => {
    expect(
      buildMobileQuickCommandLaunch(command({ command: 'cd app\npnpm install\npnpm test' }))
    ).toEqual({
      options: {
        startupCommand: 'cd app; pnpm install; pnpm test',
        startupCommandDelivery: 'shell-ready'
      }
    })
  })

  it('keeps append-enter-off commands as unsubmitted input', () => {
    const text = 'printf "first\\nsecond"\n# leave this unsubmitted'
    expect(buildMobileQuickCommandLaunch(command({ command: text, appendEnter: false }))).toEqual({
      options: { initialPrompt: text, enter: false, successToast: 'Command inserted' }
    })
  })

  it('delivers supported agent prompts through host-built startup', () => {
    expect(
      buildMobileQuickCommandLaunch(
        command({ action: 'agent-prompt', agent: 'codex', prompt: 'Review this diff' })
      )
    ).toEqual({ agent: 'codex', options: { agentPrompt: 'Review this diff' } })
  })

  it('bounds native preview text without truncating launch content', () => {
    const prompt = `Review ${'x'.repeat(5993)}`
    const preset = command({ action: 'agent-prompt', agent: 'codex', prompt })

    expect(getQuickCommandDisplayPreview(preset)).toHaveLength(240)
    expect(getQuickCommandPreview(preset)).toBe(`Codex: ${prompt}`)
    expect(buildMobileQuickCommandLaunch(preset)).toEqual({
      agent: 'codex',
      options: { agentPrompt: prompt }
    })
  })
})
