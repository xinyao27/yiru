import { spawnSync } from 'node:child_process'

import {
  CODEX_GRANT_ENTRY_COMMAND,
  resolveInternalEntryInvocation
} from '../../runtime/internal-entry'
import {
  CodexAppServerTimeoutError,
  CodexAppServerUnsupportedError,
  type CodexHookTrustGrantRequest,
  type CodexHookTrustGrantSessionResult
} from './app-server-client'
import type {
  CodexAppServerEntryRequest,
  CodexAppServerEntryResult,
  GrantEntryEnvelope
} from './app-server-grant-envelope'
import type {
  CodexUserHookTrustRebaseRequest,
  CodexUserHookTrustRebaseResult
} from './user-hook-trust-rebase-client'

// Why: spawnSync must outlive the session deadline so the entry's own timeout
// (and its result envelope) win the race; the margin only reaps a hung entry.
const GRANT_ENTRY_TIMEOUT_MARGIN_MS = 5_000
const GRANT_ENTRY_MAX_BUFFER_BYTES = 16 * 1024 * 1024

export type RunGrantSessionSyncOptions = { timeoutMarginMs?: number }

/**
 * Blocking wrapper for the grant session. Hook install/refresh is synchronous
 * launch prep (pane launch must not proceed until trust is settled), and a
 * stdio JSON-RPC session needs a live event loop — so the session runs in a
 * short-lived daemon child while the caller blocks on spawnSync. spawnSync
 * always reaps the entry; a killed entry closes the codex child's stdin,
 * which makes codex app-server exit on EOF.
 */
export function runCodexHookTrustGrantSessionSync(
  request: CodexHookTrustGrantRequest,
  options: RunGrantSessionSyncOptions = {}
): CodexHookTrustGrantSessionResult {
  return runCodexAppServerEntrySync(request, options) as CodexHookTrustGrantSessionResult
}

export function runCodexUserHookTrustRebaseSessionSync(
  request: CodexUserHookTrustRebaseRequest,
  options: RunGrantSessionSyncOptions = {}
): CodexUserHookTrustRebaseResult {
  return runCodexAppServerEntrySync(request, options) as CodexUserHookTrustRebaseResult
}

function runCodexAppServerEntrySync(
  request: CodexAppServerEntryRequest,
  options: RunGrantSessionSyncOptions
): CodexAppServerEntryResult {
  const invocation = resolveInternalEntryInvocation(CODEX_GRANT_ENTRY_COMMAND)
  const spawned = spawnSync(invocation.command, invocation.args, {
    input: JSON.stringify(request),
    encoding: 'utf8',
    timeout:
      request.invocation.timeoutMs + (options.timeoutMarginMs ?? GRANT_ENTRY_TIMEOUT_MARGIN_MS),
    killSignal: 'SIGKILL',
    maxBuffer: GRANT_ENTRY_MAX_BUFFER_BYTES,
    windowsHide: true,
    env: { ...process.env }
  })
  if ((spawned.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT') {
    // Why: spawnSync reports its own deadline through error.code before the
    // signal field; preserve the typed timeout so cooldown diagnostics work.
    throw new CodexAppServerTimeoutError(
      `codex trust-grant entry exceeded ${request.invocation.timeoutMs}ms session deadline`
    )
  }
  if (spawned.error) {
    throw spawned.error
  }
  if (spawned.signal) {
    throw new CodexAppServerTimeoutError(
      `codex trust-grant entry killed by ${spawned.signal} after ${request.invocation.timeoutMs}ms deadline`
    )
  }
  const lines = (spawned.stdout ?? '').split('\n').filter((line) => line.trim().length > 0)
  const lastLine = lines.at(-1)
  let envelope: GrantEntryEnvelope | null = null
  if (lastLine) {
    try {
      envelope = JSON.parse(lastLine) as GrantEntryEnvelope
    } catch {
      envelope = null
    }
  }
  if (!envelope) {
    throw new Error(
      `codex trust-grant entry produced no result (exit ${spawned.status ?? 'unknown'})${
        spawned.stderr ? `: ${spawned.stderr.trim().slice(0, 400)}` : ''
      }`
    )
  }
  if (!envelope.ok) {
    if (envelope.unsupported) {
      throw new CodexAppServerUnsupportedError(envelope.message)
    }
    if (envelope.errorName === 'CodexAppServerTimeoutError') {
      throw new CodexAppServerTimeoutError(envelope.message)
    }
    throw new Error(envelope.message)
  }
  return envelope.result
}
