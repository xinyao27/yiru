import { describe, expect, it } from 'vite-plus/test'

import {
  applyTerminalQuickCommandMutation,
  flattenTerminalQuickCommand,
  normalizeTerminalQuickCommands,
  parseNormalizedTerminalQuickCommands,
  supportsTerminalAgentQuickCommand
} from '../src/terminal-quick-commands'

describe('terminal quick commands', () => {
  it('normalizes both command actions into canonical persisted records', () => {
    expect(
      normalizeTerminalQuickCommands([
        { id: 'status', label: ' Status ', command: 'git status', appendEnter: true },
        {
          id: 'review',
          label: 'Review',
          action: 'agent-prompt',
          agent: 'codex',
          prompt: 'Review this diff'
        }
      ])
    ).toEqual([
      {
        id: 'status',
        label: 'Status',
        action: 'terminal-command',
        command: 'git status',
        appendEnter: true,
        scope: { type: 'global' }
      },
      {
        id: 'review',
        label: 'Review',
        action: 'agent-prompt',
        agent: 'codex',
        prompt: 'Review this diff',
        scope: { type: 'global' }
      }
    ])
  })

  it('accepts only complete canonical lists at protocol boundaries', () => {
    const canonical = normalizeTerminalQuickCommands([
      { id: 'status', label: 'Status', command: 'git status', appendEnter: true }
    ])

    expect(parseNormalizedTerminalQuickCommands(canonical)).toEqual(canonical)
    expect(parseNormalizedTerminalQuickCommands([{ ...canonical[0], command: 42 }])).toBeNull()
    expect(parseNormalizedTerminalQuickCommands([...canonical, ...canonical])).toBeNull()
  })

  it('applies a targeted mutation without replacing unrelated commands', () => {
    const [first, second] = normalizeTerminalQuickCommands([
      { id: 'first', label: 'First', command: 'echo first', appendEnter: true },
      { id: 'second', label: 'Second', command: 'echo second', appendEnter: true }
    ])
    const edited = { ...first!, label: 'Edited' }

    expect(
      applyTerminalQuickCommandMutation([first!, second!], { type: 'upsert', command: edited })
    ).toEqual([edited, second])
    expect(
      applyTerminalQuickCommandMutation([first!, second!], { type: 'delete', id: first!.id })
    ).toEqual([second])
  })

  it('limits prompt commands to agents with startup-safe injection', () => {
    expect(supportsTerminalAgentQuickCommand('codex')).toBe(true)
    expect(supportsTerminalAgentQuickCommand('opencode')).toBe(true)
    expect(supportsTerminalAgentQuickCommand('aider')).toBe(false)
  })

  it('flattens multiline runnable commands into one shell command list', () => {
    expect(
      flattenTerminalQuickCommand({
        id: 'test',
        label: 'Test',
        command: 'cd app\npnpm install\npnpm test',
        appendEnter: true
      }).command
    ).toBe('cd app; pnpm install; pnpm test')
  })
})
