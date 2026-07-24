import { describe, expect, it } from 'vite-plus/test'

import { supportsTerminalAgentQuickCommand } from '../../../../shared/terminal-quick-commands'
import { TUI_AGENT_CONFIG } from '../../../../shared/tui-agent-config'
import { CreateTerminalTab } from './session-tabs-schemas'
import { TerminalQuickCommandsUpdate } from './terminal-quick-command-rpc-schema'

describe('terminal quick-command RPC schemas', () => {
  it('requires agent prompts to use an agent preset without a raw command', () => {
    expect(
      CreateTerminalTab.safeParse({ worktree: 'id:wt-1', agentPrompt: 'Review this diff' }).success
    ).toBe(false)
    expect(
      CreateTerminalTab.safeParse({
        worktree: 'id:wt-1',
        agent: 'codex',
        agentPrompt: 'Review this diff',
        command: 'codex'
      }).success
    ).toBe(false)
    expect(
      CreateTerminalTab.safeParse({
        worktree: 'id:wt-1',
        agent: 'codex',
        agentPrompt: 'Review this diff'
      }).success
    ).toBe(true)
  })

  it('normalizes valid targeted updates and rejects unsupported agents', () => {
    const valid = TerminalQuickCommandsUpdate.safeParse({
      mutation: {
        type: 'upsert',
        command: {
          id: 'review',
          label: 'Review',
          action: 'agent-prompt',
          agent: 'codex',
          prompt: 'Review this diff'
        }
      }
    })
    expect(valid.success).toBe(true)
    if (valid.success) {
      expect(valid.data.mutation).toMatchObject({
        type: 'upsert',
        command: { scope: { type: 'global' } }
      })
    }
    expect(
      TerminalQuickCommandsUpdate.safeParse({
        mutation: {
          type: 'upsert',
          command: {
            id: 'aider',
            label: 'Aider',
            action: 'agent-prompt',
            agent: 'aider',
            prompt: 'Review this diff'
          }
        }
      }).success
    ).toBe(false)
  })

  it('keeps the cross-client agent policy aligned with host launch modes', () => {
    for (const [agent, config] of Object.entries(TUI_AGENT_CONFIG)) {
      expect(supportsTerminalAgentQuickCommand(agent)).toBe(
        config.promptInjectionMode !== 'stdin-after-start'
      )
    }
  })
})
