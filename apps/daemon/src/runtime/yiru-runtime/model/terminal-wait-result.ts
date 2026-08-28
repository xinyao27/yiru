import type {
  RuntimeTerminalState,
  RuntimeTerminalWait,
  RuntimeTerminalWaitBlockedReason,
  RuntimeTerminalWaitCondition
} from '@yiru/runtime-protocol/workbench/runtime-types'

import { getTerminalState } from './terminal-read'
import type { RuntimeLeafRecord, RuntimePtyWorktreeRecord } from './terminal-records'
import { TERMINAL_WAIT_BLOCKED_SENTINEL_RE } from './terminal-wait-readiness'

export function findTerminalWaitBlockedSignal(
  normalized: string
): { reason: RuntimeTerminalWaitBlockedReason; index: number } | null {
  // Why: this runs once per PTY chunk over a tail up to 256 KiB. One combined
  // negative scan avoids a dozen full-tail searches when no prompt can match.
  if (!TERMINAL_WAIT_BLOCKED_SENTINEL_RE.test(normalized)) {
    return null
  }
  const candidates: { reason: RuntimeTerminalWaitBlockedReason; index: number }[] = []
  const updateIndex = normalized.lastIndexOf('update available')
  if (updateIndex !== -1 && normalized.includes('press enter to continue', updateIndex)) {
    candidates.push({ reason: 'codex-update-prompt', index: updateIndex })
  }
  const cwdIndex = normalized.lastIndexOf('choose working directory to')
  if (cwdIndex !== -1 && normalized.includes('press enter to continue', cwdIndex)) {
    candidates.push({ reason: 'codex-cwd-prompt', index: cwdIndex })
  }
  const modelMigrationIndex = normalized.lastIndexOf('codex just got an upgrade')
  if (
    modelMigrationIndex !== -1 &&
    normalized.includes('press enter to continue', modelMigrationIndex)
  ) {
    candidates.push({ reason: 'codex-model-migration-prompt', index: modelMigrationIndex })
  }
  const hooksIndex = normalized.lastIndexOf('hooks need review')
  if (hooksIndex !== -1 && normalized.includes('press enter to confirm', hooksIndex)) {
    candidates.push({ reason: 'codex-hooks-review-prompt', index: hooksIndex })
  }
  const trustIndex = Math.max(
    normalized.lastIndexOf('do you trust'),
    normalized.lastIndexOf('trust this'),
    normalized.lastIndexOf('trusted workspace')
  )
  const trustSegment = trustIndex === -1 ? '' : normalized.slice(trustIndex)
  if (
    trustIndex !== -1 &&
    (trustSegment.includes('workspace') ||
      trustSegment.includes('folder') ||
      trustSegment.includes('directory') ||
      trustSegment.includes('repo'))
  ) {
    candidates.push({ reason: 'codex-trust-workspace', index: trustIndex })
  }
  const interactivePromptIndex = Math.max(
    normalized.lastIndexOf('press enter to confirm'),
    normalized.lastIndexOf('press enter to continue'),
    normalized.lastIndexOf('press enter to view'),
    normalized.lastIndexOf('press enter to insert'),
    normalized.lastIndexOf('press t to trust')
  )
  const interactivePromptContext =
    interactivePromptIndex === -1
      ? ''
      : normalized.slice(Math.max(0, interactivePromptIndex - 600), interactivePromptIndex + 200)
  const hasCodexInteractiveContext =
    interactivePromptContext.includes('codex') ||
    interactivePromptContext.includes('permission') ||
    interactivePromptContext.includes('sandbox') ||
    interactivePromptContext.includes('trust') ||
    interactivePromptContext.includes('hook')
  if (interactivePromptIndex !== -1 && hasCodexInteractiveContext) {
    const contextStart = Math.max(0, interactivePromptIndex - 600)
    const hasSpecificPromptInContext = candidates.some(
      (candidate) => candidate.index >= contextStart && candidate.index <= interactivePromptIndex
    )
    if (!hasSpecificPromptInContext) {
      candidates.push({ reason: 'codex-interactive-prompt', index: interactivePromptIndex })
    }
  }
  return candidates.length > 0
    ? candidates.reduce((latest, candidate) =>
        candidate.index > latest.index ? candidate : latest
      )
    : null
}

export function buildTerminalWaitResult(
  handle: string,
  condition: RuntimeTerminalWaitCondition,
  leaf: RuntimeLeafRecord
): RuntimeTerminalWait {
  return buildTerminalWait(handle, condition, getTerminalState(leaf), leaf.lastExitCode)
}

export function buildTerminalWaitBlockedResult(
  handle: string,
  condition: RuntimeTerminalWaitCondition,
  leaf: RuntimeLeafRecord,
  blockedReason: RuntimeTerminalWaitBlockedReason
): RuntimeTerminalWait {
  return buildTerminalWait(
    handle,
    condition,
    getTerminalState(leaf),
    leaf.lastExitCode,
    blockedReason
  )
}

export function buildPtyTerminalWaitResult(
  handle: string,
  condition: RuntimeTerminalWaitCondition,
  pty: RuntimePtyWorktreeRecord
): RuntimeTerminalWait {
  return buildTerminalWait(handle, condition, getPtyTerminalState(pty), pty.lastExitCode)
}

export function buildPtyTerminalWaitBlockedResult(
  handle: string,
  condition: RuntimeTerminalWaitCondition,
  pty: RuntimePtyWorktreeRecord,
  blockedReason: RuntimeTerminalWaitBlockedReason
): RuntimeTerminalWait {
  return buildTerminalWait(
    handle,
    condition,
    getPtyTerminalState(pty),
    pty.lastExitCode,
    blockedReason
  )
}

export function buildTerminalWait(
  handle: string,
  condition: RuntimeTerminalWaitCondition,
  status: RuntimeTerminalState,
  exitCode: number | null,
  blockedReason?: RuntimeTerminalWaitBlockedReason
): RuntimeTerminalWait {
  return {
    handle,
    condition,
    satisfied: blockedReason === undefined,
    status,
    exitCode,
    ...(blockedReason ? { blockedReason } : {})
  }
}

export function getPtyTerminalState(pty: RuntimePtyWorktreeRecord): RuntimeTerminalState {
  return pty.connected ? 'running' : pty.lastExitCode !== null ? 'exited' : 'unknown'
}
