import { prefetchWorktreeCreateBase } from '~main/worktree-create-base-prefetch'
import { createDraftPasteReadyScanner } from '~shared/draft-paste-ready-scanner'
import { TUI_AGENT_CONFIG } from '~shared/tui-agent/config'
import type { TuiAgent } from '~shared/types'

import { BRACKETED_PASTE_QUIET_MS, DRAFT_PASTE_READY_TIMEOUT_MS } from '../model/terminal-startup'
import { RuntimeWorktreeProvisionManagedWorktreeTerminals } from './provision-managed-worktree-terminals'

export abstract class RuntimeWorktreeWaitForStartupDraftReady extends RuntimeWorktreeProvisionManagedWorktreeTerminals {
  protected waitForStartupDraftReady(handle: string, agent: TuiAgent): Promise<string | null> {
    const livePty = this.getLivePtyForHandle(handle)
    const ptyId = livePty?.pty.ptyId
    if (!ptyId) {
      return Promise.resolve(null)
    }
    const readySignal =
      TUI_AGENT_CONFIG[agent].draftPasteReadySignal ?? 'render-quiet-after-bracketed-paste'
    return new Promise<string | null>((resolve) => {
      let settled = false
      const scanner = createDraftPasteReadyScanner(readySignal)
      let quietTimer: NodeJS.Timeout | null = null
      let hardTimer: NodeJS.Timeout | null = null
      let unsubscribe: (() => void) | null = null

      const finish = (value: string | null): void => {
        if (settled) {
          return
        }
        settled = true
        if (quietTimer) {
          clearTimeout(quietTimer)
        }
        if (hardTimer) {
          clearTimeout(hardTimer)
        }
        unsubscribe?.()
        resolve(value)
      }

      const armQuietTimer = (): void => {
        if (quietTimer) {
          clearTimeout(quietTimer)
        }
        quietTimer = setTimeout(() => finish(ptyId), BRACKETED_PASTE_QUIET_MS)
      }

      const observeData = (data: string): void => {
        const { ready, armQuietTimer: shouldArm } = scanner.observe(data)
        if (ready) {
          finish(ptyId)
          return
        }
        if (shouldArm) {
          armQuietTimer()
        }
      }

      unsubscribe = this.subscribeToTerminalData(ptyId, observeData)
      const replay = this.recentPtyOutputById.get(ptyId)
      if (replay) {
        observeData(replay)
      }
      hardTimer = setTimeout(() => finish(null), DRAFT_PASTE_READY_TIMEOUT_MS)
    })
  }

  async prefetchManagedWorktreeCreateBase(args: {
    repoSelector: string
    baseBranch?: string
  }): Promise<void> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }

    const repo = await this.resolveRepoSelector(args.repoSelector)
    await prefetchWorktreeCreateBase({
      repo,
      baseBranch: args.baseBranch,
      runtime: this
    })
  }
}
