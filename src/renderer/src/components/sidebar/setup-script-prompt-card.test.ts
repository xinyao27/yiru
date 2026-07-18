import { describe, expect, it } from 'vite-plus/test'
import { getRenderedSetupScriptPromptState } from './setup-script-prompt-render-state'
import type { SetupScriptPromptInspection } from '@/lib/setup-script-prompt'

function prompt(repoId: string): SetupScriptPromptInspection {
  return {
    status: 'ok',
    repoId,
    hasEffectiveSetup: false,
    hasSharedHooks: false,
    candidate: null
  }
}

describe('getRenderedSetupScriptPromptState', () => {
  it('uses the current inspection when it belongs to the active repo', () => {
    const current = prompt('repo-local')

    expect(
      getRenderedSetupScriptPromptState({
        promptState: current,
        activeRepoId: 'repo-local',
        activeProjectId: 'github:xinyao27/yiru',
        lastVisiblePrompt: { state: prompt('repo-ssh'), projectId: 'github:xinyao27/yiru' }
      })
    ).toBe(current)
  })

  it('keeps the previous visible prompt during same-project host inspection refresh', () => {
    const previous = prompt('repo-local')

    expect(
      getRenderedSetupScriptPromptState({
        promptState: null,
        activeRepoId: 'repo-ssh',
        activeProjectId: 'github:xinyao27/yiru',
        lastVisiblePrompt: { state: previous, projectId: 'github:xinyao27/yiru' }
      })
    ).toBe(previous)
  })

  it('does not keep a stale prompt when switching to a different project', () => {
    expect(
      getRenderedSetupScriptPromptState({
        promptState: null,
        activeRepoId: 'repo-other',
        activeProjectId: 'github:xinyao27/other',
        lastVisiblePrompt: { state: prompt('repo-local'), projectId: 'github:xinyao27/yiru' }
      })
    ).toBeNull()
  })
})
