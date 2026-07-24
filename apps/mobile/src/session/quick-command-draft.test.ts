import { describe, expect, it, vi } from 'vite-plus/test'

import {
  createEmptyQuickCommandDraft,
  draftToQuickCommand,
  isQuickCommandDraftValid,
  quickCommandToDraft
} from './quick-command-draft'

describe('quick-command drafts', () => {
  it('validates terminal and agent actions independently', () => {
    const draft = createEmptyQuickCommandDraft({ type: 'global' })
    expect(isQuickCommandDraftValid(draft)).toBe(false)
    expect(isQuickCommandDraftValid({ ...draft, label: 'Test', command: 'pnpm test' })).toBe(true)
    expect(
      isQuickCommandDraftValid({
        ...draft,
        label: 'Review',
        action: 'agent-prompt',
        agent: 'codex',
        prompt: 'Review this diff'
      })
    ).toBe(true)
  })

  it('preserves scope and action when editing persisted commands', () => {
    expect(
      quickCommandToDraft({
        id: 'review',
        label: 'Review',
        action: 'agent-prompt',
        agent: 'codex',
        prompt: 'Review this diff',
        scope: { type: 'repo', repoId: 'repo-1' }
      })
    ).toMatchObject({
      id: 'review',
      action: 'agent-prompt',
      agent: 'codex',
      scope: { type: 'repo', repoId: 'repo-1' }
    })
  })

  it('creates collision-resistant ids for new commands', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const built = draftToQuickCommand({
      ...createEmptyQuickCommandDraft({ type: 'global' }),
      label: 'Test',
      command: 'pnpm test'
    })

    expect(built?.id).toMatch(/^quick-command-3f-/)
    vi.restoreAllMocks()
  })
})
