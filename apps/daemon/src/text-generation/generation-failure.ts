import {
  cleanGeneratedCommitMessage,
  excerptAgentFailureOutput
} from '@yiru/runtime-protocol/workbench/commit-message/prompt'

import { withMacTailscaleDnsHint } from '../network/macos-tailscale-dns-diagnostic'
import { captureAgentGenerationFailureOutput } from './agent-failure-output'
import type { InternalTextGenerationResult } from './generation-types'

export function formatAgentCliFailureMessage(
  label: string,
  stdout: string,
  stderr: string,
  exitCode: number | null,
  options?: { includeLocalMacDnsHint?: boolean; includeStdoutDetail?: boolean }
): string {
  const detail = sanitizeAgentFailureDetail(
    excerptAgentFailureOutput(options?.includeStdoutDetail === false ? '' : stdout, stderr)
  )
  const message =
    exitCode === null
      ? detail
        ? `${label} CLI command was terminated before exiting: ${detail}`
        : `${label} CLI command was terminated before exiting.`
      : detail
        ? `${label} CLI command failed with code ${exitCode}: ${detail}`
        : `${label} CLI command failed with code ${exitCode}.`
  return options?.includeLocalMacDnsHint === false
    ? message
    : withMacTailscaleDnsHint(message, detail)
}

function sanitizeAgentFailureDetail(detail: string | null): string | null {
  // Cf covers bidi overrides (U+202E etc.) that could visually reorder the
  // persisted, client-synced detail.
  const trimmed = detail
    ?.replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!trimmed) {
    return null
  }
  // Why: agent stderr often includes local or SSH repo paths. Persisting those
  // into worktree metadata leaks environment details into synced renderer state.
  const redacted = trimmed
    .replace(
      /\\\\[^\s"'`<>\\]+\\(?:[^\s"'`<>\\]+(?:\s+[^\s"'`<>\\]+)*(?=\\)\\)*[^\s"'`<>\\]+/g,
      '[path]'
    )
    // Only backslashes may repeat: JSON provider bodies double them
    // (`C:\\Users\\name\\…`), while a URL's `://` must stay single so remedy
    // links like `https://…` survive redaction.
    .replace(
      /[A-Za-z]:(?:\\+|\/)(?:[^\s"'`<>\\/|:*?]+(?:\s+[^\s"'`<>\\/|:*?]+)*(?=[\\/])(?:\\+|\/))*[^\s"'`<>\\/|:*?]+/g,
      '[path]'
    )
    // Why: require ≥2 segments (one internal `/`) so provider remedy tokens like
    // `/login` survive while multi-segment paths (`/Users/name/repo`) still redact.
    // `=:,` prefixes catch key=/path value:/path list,/path shapes in provider bodies.
    .replace(
      /(^|[\s"'`(=:,])\/(?:[^\s"'`<>/]+(?:\s+[^\s"'`<>/]+)*(?=\/)\/)+[^\s"'`<>/]+/g,
      '$1[path]'
    )
  return redacted.length > 240 ? `${redacted.slice(0, 240).trimEnd()}...` : redacted
}

export function userFacingUnsafeWindowsBatchArgs(label: string): string {
  return `${label} cannot be run as a Windows batch command with the prompt in argv. Remove {prompt} so Yiru sends the prompt on stdin.`
}

export function finalizeFromAgentOutput(args: {
  code: number | null
  stdout: string
  stderr: string
  label: string
  emptyResultName: string
  finalize: (result: InternalTextGenerationResult) => void
  includeLocalMacDnsHint?: boolean
  includeStdoutDetail?: boolean
}): void {
  const {
    code,
    stdout,
    stderr,
    label,
    emptyResultName,
    finalize,
    includeLocalMacDnsHint,
    includeStdoutDetail
  } = args
  if (code !== 0) {
    console.error('[commit-message] Generator failed:', {
      label,
      exitCode: code,
      stdout,
      stderr
    })
    finalize({
      success: false,
      error: formatAgentCliFailureMessage(label, stdout, stderr, code, {
        includeLocalMacDnsHint,
        includeStdoutDetail
      }),
      failureOutput: captureAgentGenerationFailureOutput(label, code, stdout, stderr) ?? undefined
    })
    return
  }
  const cleaned = cleanGeneratedCommitMessage(stdout)
  if (!cleaned) {
    // stdout is the (empty) result here, not diagnostics, so only stderr is
    // excerpted. The run exited 0, so this stays "returned an empty result"
    // rather than misreporting a command failure.
    const detail = sanitizeAgentFailureDetail(excerptAgentFailureOutput('', stderr))
    if (detail) {
      console.error('[commit-message] Generator returned no stdout but wrote to stderr:', {
        label,
        exitCode: code,
        stdout,
        stderr
      })
    }
    finalize({
      success: false,
      error: detail
        ? `${label} returned an empty ${emptyResultName}. CLI output: ${detail}`
        : `${label} returned an empty ${emptyResultName}.`,
      failureOutput: captureAgentGenerationFailureOutput(label, code, stdout, stderr) ?? undefined
    })
    return
  }
  finalize({
    success: true,
    rawOutput: cleaned,
    agentLabel: label
  })
}
