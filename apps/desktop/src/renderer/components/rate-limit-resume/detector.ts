// Watches every live agent pane's output for a provider limit banner and
// reports it to main, which resolves the reset time.
//
// Why the renderer and not main: pane bytes reach main through four different
// providers (local, WSL, SSH, relay) but converge on one dispatcher here, so a
// single sidecar covers every host and every agent.

import type { AgentStatusEntry, AgentType } from '@yiru/workbench-model/agent'
import { useEffect } from 'react'
import { subscribeToPtyData } from '~renderer/components/terminal-pane/pty/data-sidecar-subscriptions'
import { useAppStore } from '~renderer/store'
import {
  createRateLimitBannerScanner,
  type RateLimitBannerScanner
} from '~shared/rate-limit-resume/banner-scanner'

import { stripScrollbackAnsi } from '../native-chat/scrape-fallback'

type PaneTarget = {
  ptyId: string
  tabId: string
  paneKey: string
  worktreeId: string
  agent: AgentType
  prompt: string
}

type Attachment = {
  agent: AgentType
  scanner: RateLimitBannerScanner
  unsubscribe: () => void
}

function tabIdForEntry(entry: AgentStatusEntry): string | null {
  return entry.tabId ?? entry.paneKey.split(':')[0] ?? null
}

/** Agent panes worth watching: a live agent, a known pty, and a prompt to replay. */
export function collectRateLimitPaneTargets(
  agentStatusByPaneKey: Record<string, AgentStatusEntry>,
  ptyIdsByTabId: Record<string, string[]>
): PaneTarget[] {
  const targets: PaneTarget[] = []
  for (const entry of Object.values(agentStatusByPaneKey)) {
    const tabId = tabIdForEntry(entry)
    const agent = entry.agentType
    // Why: a resume replays the prompt that was cut short. With no prompt on
    // record there is nothing to send back, so the pane is not worth watching.
    if (!tabId || !agent || !entry.prompt.trim() || !entry.worktreeId) {
      continue
    }
    for (const ptyId of ptyIdsByTabId[tabId] ?? []) {
      targets.push({
        ptyId,
        tabId,
        paneKey: entry.paneKey,
        worktreeId: entry.worktreeId,
        agent,
        prompt: entry.prompt
      })
    }
  }
  return targets
}

async function reportBanner(target: PaneTarget, bannerLines: string[]): Promise<void> {
  try {
    const hit = await window.api.rateLimitResume.report({
      agent: target.agent,
      ptyId: target.ptyId,
      tabId: target.tabId,
      paneKey: target.paneKey,
      worktreeId: target.worktreeId,
      bannerLines,
      prompt: target.prompt
    })
    useAppStore.getState().recordRateLimitHit(hit)
  } catch (error) {
    console.error('Failed to report rate-limit banner:', error)
  }
}

/**
 * Keep one banner scanner attached per live agent pane. Runs once at App level;
 * the store subscription is a plain listener so pane churn never re-renders the
 * tree.
 */
export function useRateLimitResumeDetector(): void {
  useEffect(() => {
    const attachments = new Map<string, Attachment>()

    const detach = (ptyId: string): void => {
      attachments.get(ptyId)?.unsubscribe()
      attachments.delete(ptyId)
    }

    const sync = (): void => {
      const state = useAppStore.getState()
      const targets = collectRateLimitPaneTargets(state.agentStatusByPaneKey, state.ptyIdsByTabId)
      const seen = new Set<string>()
      for (const target of targets) {
        seen.add(target.ptyId)
        const existing = attachments.get(target.ptyId)
        if (existing && existing.agent === target.agent) {
          continue
        }
        // The pane changed agents; the old wordings no longer apply.
        detach(target.ptyId)
        const scanner = createRateLimitBannerScanner(target.agent)
        const unsubscribe = subscribeToPtyData(target.ptyId, (data) => {
          const banner = scanner.push(stripScrollbackAnsi(data))
          if (!banner) {
            return
          }
          // Read the prompt at detection time — the pane's last prompt may have
          // advanced since the sidecar attached.
          const live = collectRateLimitPaneTargets(
            useAppStore.getState().agentStatusByPaneKey,
            useAppStore.getState().ptyIdsByTabId
          ).find((entry) => entry.ptyId === target.ptyId)
          void reportBanner(live ?? target, banner)
        })
        attachments.set(target.ptyId, { agent: target.agent, scanner, unsubscribe })
      }
      for (const ptyId of attachments.keys()) {
        if (!seen.has(ptyId)) {
          detach(ptyId)
        }
      }
    }

    sync()
    const unsubscribeStore = useAppStore.subscribe((state, previousState) => {
      if (
        state.agentStatusByPaneKey === previousState.agentStatusByPaneKey &&
        state.ptyIdsByTabId === previousState.ptyIdsByTabId
      ) {
        return
      }
      sync()
    })

    return () => {
      unsubscribeStore()
      for (const ptyId of attachments.keys()) {
        detach(ptyId)
      }
    }
  }, [])
}
