import type {
  Automation,
  AutomationRun,
  AutomationRunOutputSnapshot
} from '~shared/automations-types'

import { translateMain } from '../i18n/main-i18n'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { buildHeadlessAutomationWorktreeCreateArgs } from './headless-workspace-create'
import type { AutomationRunTargetResult } from './run-target-resolution'

const MAX_HEADLESS_OUTPUT_SNAPSHOT_CHARS = 256 * 1024

export type HeadlessAutomationDispatchLaunch = {
  workspaceId: string
  workspaceDisplayName?: string | null
  terminalSessionId: string | null
  terminalPaneKey?: string | null
  terminalPtyId?: string | null
  completion?: Promise<{
    status: 'completed' | 'dispatch_failed'
    outputSnapshot?: AutomationRunOutputSnapshot | null
    error?: string | null
  }>
}

export type HeadlessAutomationDispatcher = (request: {
  automation: Automation
  run: AutomationRun
  target: Extract<AutomationRunTargetResult, { ok: true }>
}) => Promise<HeadlessAutomationDispatchLaunch>

export function createHeadlessAutomationDispatcher(
  runtime: YiruRuntimeService
): HeadlessAutomationDispatcher {
  return async ({ automation, run, target }) => {
    const terminalSnapshotLimit = 2_000
    let terminalHandle: string
    let terminalSessionId: string | null = null
    let terminalPaneKey: string | null = null
    let terminalPtyId: string | null = null
    let workspaceId: string
    let workspaceDisplayName: string | null = null

    if (automation.workspaceMode === 'new_per_run') {
      const created = await runtime.createManagedWorktree({
        ...buildHeadlessAutomationWorktreeCreateArgs({
          automation,
          run,
          repo: target.repo
        })
      })
      terminalHandle = created.startupTerminal?.handle ?? ''
      terminalSessionId = created.startupTerminal?.tabId ?? null
      terminalPaneKey = created.startupTerminal?.paneKey ?? null
      terminalPtyId = created.startupTerminal?.ptyId ?? null
      workspaceId = created.worktree.id
      workspaceDisplayName = created.worktree.displayName ?? null
      if (!terminalHandle) {
        throw new Error(
          created.warning ||
            translateMain(
              'automations.workspaceTerminalMissing',
              'Automation workspace was created, but no agent terminal started.'
            )
        )
      }
    } else {
      if (!automation.workspaceId) {
        throw new Error(
          translateMain(
            'automations.targetWorkspaceMissing',
            'The target workspace is no longer available.'
          )
        )
      }
      const terminal = await runtime.launchAgentTerminal(`id:${automation.workspaceId}`, {
        agent: automation.agentId,
        prompt: automation.prompt,
        title: run.title
      })
      terminalHandle = terminal.handle
      terminalSessionId = terminal.tabId ?? null
      terminalPaneKey = terminal.paneKey ?? null
      terminalPtyId = terminal.ptyId ?? null
      workspaceId = terminal.worktreeId
      const worktree = await runtime.showManagedWorktree(`id:${workspaceId}`)
      workspaceDisplayName = worktree.displayName ?? null
    }

    const completion = (async () => {
      const wait = await runtime.waitForTerminal(terminalHandle, { condition: 'tui-idle' })
      const read = await runtime.readTerminal(terminalHandle, { limit: terminalSnapshotLimit })
      const snapshotBuffer = createHeadlessAutomationOutputSnapshotBuffer()
      snapshotBuffer.append(read.tail.join('\n'))
      if (wait.satisfied) {
        return {
          status: 'completed' as const,
          outputSnapshot: snapshotBuffer.snapshot(),
          error: null
        }
      }
      return {
        status: 'dispatch_failed' as const,
        outputSnapshot: snapshotBuffer.snapshot(),
        error: wait.blockedReason
          ? translateMain('automations.agentBlocked', 'Automation agent is blocked: {{reason}}.', {
              reason: wait.blockedReason
            })
          : translateMain(
              'automations.agentIncomplete',
              'Automation agent did not report completion.'
            )
      }
    })()

    return {
      workspaceId,
      workspaceDisplayName,
      terminalSessionId,
      terminalPaneKey,
      terminalPtyId,
      completion
    }
  }
}

export function createHeadlessAutomationOutputSnapshotBuffer(): {
  append: (chunk: string) => void
  snapshot: () => AutomationRunOutputSnapshot | null
} {
  const chunks: string[] = []
  let totalChars = 0
  let truncated = false

  return {
    append(chunk): void {
      if (!chunk) {
        return
      }
      chunks.push(chunk)
      totalChars += chunk.length
      let overflowChars = totalChars - MAX_HEADLESS_OUTPUT_SNAPSHOT_CHARS
      while (overflowChars > 0 && chunks.length > 0) {
        const firstChunk = chunks[0]!
        if (firstChunk.length <= overflowChars) {
          chunks.shift()
          totalChars -= firstChunk.length
          overflowChars -= firstChunk.length
          truncated = true
          continue
        }
        chunks[0] = firstChunk.slice(overflowChars)
        totalChars -= overflowChars
        truncated = true
        overflowChars = 0
      }
    },
    snapshot(): AutomationRunOutputSnapshot | null {
      const content = chunks.join('').trim()
      if (!content) {
        return null
      }
      return {
        format: 'plain_text',
        content,
        capturedAt: Date.now(),
        truncated
      }
    }
  }
}
