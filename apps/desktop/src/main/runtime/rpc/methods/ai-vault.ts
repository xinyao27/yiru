import type { AiVaultListResult, AiVaultListSessionsInput } from '@yiru/runtime-protocol/ai-vault'
import { listAiVaultSessions } from '~main/ai-vault/ai-vault'
import { restampAiVaultListResult } from '~main/ai-vault/session/list-results'

import type { RpcContext } from '../core'

// Why: 切片 80 retired this leaf's legacy `defineMethod` registration —
// `orpc/router-direct/ai-vault.ts` wires this handler straight to the
// contract now. Kept as a plain export (not folded into that file) because
// it is also the shape `runtime.listAiVaultSessions` expects, matching the
// `hosted-review.ts`/`diagnostics.ts` precedent of leaving the handler beside
// the runtime call it wraps.
export async function listRuntimeAiVaultSessions(
  params: AiVaultListSessionsInput,
  { runtime }: RpcContext
): Promise<AiVaultListResult> {
  const compact = params.compact === true
  if (params.executionHostScope) {
    const result = await listAiVaultSessions({
      limit: params.limit,
      force: params.force,
      scopePaths: params.scopePaths,
      executionHostScope: params.executionHostScope
    })
    return compact ? compactMobileAgentHistoryResult(result) : result
  }
  const result = await runtime.listAiVaultSessions({
    limit: params.limit,
    force: params.force,
    scopePaths: params.scopePaths
  })
  // Why: web clients consume this response directly (no parent-side retag),
  // so sessions must come back stamped as the runtime host they addressed.
  const stamped = params.executionHostId
    ? restampAiVaultListResult(result, params.executionHostId)
    : result
  return compact ? compactMobileAgentHistoryResult(stamped) : stamped
}

// Why: the encrypted mobile frame adds base64 and envelope overhead after this
// projection. A 64 KiB preview budget leaves room for the required metadata of
// the full 500-session window while keeping the result below the frame limit.
const MOBILE_AGENT_HISTORY_PREVIEW_MAX_BYTES = 64 * 1024
const MOBILE_AGENT_HISTORY_PREVIEW_MESSAGE_MAX_BYTES = 1024
const MOBILE_AGENT_HISTORY_PREVIEW_TURN_LIMIT = 5
const UTF8_ENCODER = new TextEncoder()

function compactMobileAgentHistoryResult(result: AiVaultListResult): AiVaultListResult {
  let remainingPreviewBytes = MOBILE_AGENT_HISTORY_PREVIEW_MAX_BYTES
  return {
    ...result,
    sessions: result.sessions.map((session) => {
      const previewMessages = session.previewMessages
        .slice(-MOBILE_AGENT_HISTORY_PREVIEW_TURN_LIMIT)
        .map((message) => {
          if (remainingPreviewBytes <= 0) {
            return null
          }
          const text = truncateUtf8(
            message.text,
            Math.min(MOBILE_AGENT_HISTORY_PREVIEW_MESSAGE_MAX_BYTES, remainingPreviewBytes)
          )
          remainingPreviewBytes -= new TextEncoder().encode(text).byteLength
          return { ...message, text }
        })
        .filter(
          (message): message is AiVaultListResult['sessions'][number]['previewMessages'][number] =>
            message !== null
        )

      return {
        ...session,
        previewMessages,
        // Why: usage is rendered on Activity, not Agent History. Dropping
        // these optional arrays keeps the 500-session native response within
        // the encrypted WebSocket frame budget.
        tokensByDay: undefined,
        tokenUsage: undefined,
        lastUserPrompt: undefined,
        subagent: null
      }
    })
  }
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return ''
  }
  if (UTF8_ENCODER.encode(value).byteLength <= maxBytes) {
    return value
  }
  const ellipsis = '…'
  const ellipsisBytes = UTF8_ENCODER.encode(ellipsis).byteLength
  const prefixBudget = Math.max(0, maxBytes - ellipsisBytes)
  let end = Math.min(value.length, prefixBudget)
  while (end > 0 && UTF8_ENCODER.encode(value.slice(0, end)).byteLength > prefixBudget) {
    end -= 1
  }
  return `${value.slice(0, end)}${ellipsis}`
}
