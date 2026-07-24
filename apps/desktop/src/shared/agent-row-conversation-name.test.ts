import { describe, expect, it } from 'vite-plus/test'

import {
  getAgentRowConversationName,
  type ConversationNameTab
} from './agent-row-conversation-name'

function makeTab(overrides: Partial<ConversationNameTab> = {}): ConversationNameTab {
  return { customTitle: null, title: '', ...overrides }
}

describe('getAgentRowConversationName', () => {
  it('uses tab-title precedence before a live provider title', () => {
    const tab = makeTab({
      customTitle: 'Patient sync spike',
      quickCommandLabel: 'Run tests',
      generatedTitle: 'Fix intake flow',
      title: '✳ Investigate replay bug'
    })
    expect(getAgentRowConversationName(tab, 'claude', true)).toBe('Patient sync spike')
  })

  it('honors generated-title settings and strips live status decoration', () => {
    const tab = makeTab({ generatedTitle: 'Fix intake flow', title: '✳ Investigate replay bug' })

    expect(getAgentRowConversationName(tab, 'claude', true)).toBe('Fix intake flow')
    expect(getAgentRowConversationName(tab, 'claude', false)).toBe('Investigate replay bug')
  })

  it('rejects provider status, placeholders, and local or remote cwd frames', () => {
    for (const [title, agentType] of [
      ['Codex ready', 'codex'],
      ['Claude Code - action required', 'claude'],
      ['Terminal 2', 'codex'],
      ['⠋ ~/yiru/workspaces', 'codex'],
      ['/Users/dev/repo', 'codex'],
      ['C:\\repos\\yiru', 'codex'],
      ['\\\\wsl.localhost\\Ubuntu\\home\\dev\\yiru', 'codex']
    ] as const) {
      expect(getAgentRowConversationName(makeTab({ title }), agentType, false)).toBeNull()
    }
  })

  it('keeps OpenCode semantic titles whole', () => {
    expect(
      getAgentRowConversationName(
        makeTab({ title: 'OC | build the release pipeline' }),
        'opencode',
        false
      )
    ).toBe('OC | build the release pipeline')
  })
})
