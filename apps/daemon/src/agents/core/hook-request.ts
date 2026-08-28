import type { IncomingMessage } from 'node:http'

import { HOOK_REQUEST_MAX_BYTES, capOpenCodeHookText } from './hook-listener-state'

export function parseFormEncodedBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body)
  const parsed: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    parsed[key] = value
  }
  return parsed
}

export function readRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let byteLength = 0
    let settled = false
    const cleanup = (): void => {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      req.off('close', onClose)
      // Why: detached parser closures release body chunks; keep a neutral
      // error sink so a late IncomingMessage error cannot become unhandled.
      req.on('error', ignoreSettledRequestError)
    }
    const settleResolve = (value: unknown): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(value)
    }
    const settleReject = (error: unknown): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(error)
    }
    const onData = (chunk: Buffer): void => {
      // Why: check size in bytes (not UTF-16 code units) and stop accumulating
      // after rejection so a malicious client cannot push memory past the cap.
      if (byteLength + chunk.length > HOOK_REQUEST_MAX_BYTES) {
        settleReject(new Error('payload too large'))
        req.destroy()
        return
      }
      byteLength += chunk.length
      chunks.push(chunk)
    }
    const onEnd = (): void => {
      try {
        // Why: decode once via Buffer.concat so multi-byte UTF-8 characters
        // that straddle a chunk boundary are reassembled correctly.
        const body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : ''
        const contentType = req.headers['content-type'] ?? ''
        if (typeof contentType === 'string' && contentType.includes('application/json')) {
          settleResolve(body ? JSON.parse(body) : {})
          return
        }
        if (
          typeof contentType === 'string' &&
          contentType.includes('application/x-www-form-urlencoded')
        ) {
          settleResolve(parseFormEncodedBody(body))
          return
        }
        // Why: existing managed scripts POST JSON; updated POSIX scripts POST
        // form-encoded. Default to JSON for unknown content types.
        settleResolve(body ? JSON.parse(body) : {})
      } catch (error) {
        settleReject(error)
      }
    }
    const onError = (err: Error): void => {
      settleReject(err)
    }
    // Why: req.destroy() (called by the slowloris timer) emits 'close' but
    // not 'end'/'error'. Without this handler the promise would never settle
    // and the chunk buffers would be retained for the process lifetime.
    const onClose = (): void => {
      settleReject(new Error('aborted'))
    }
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
    req.on('close', onClose)
  })
}

export function ignoreSettledRequestError(): void {}

// ─── Per-pane field caches + extractors ─────────────────────────────

export type ExtractedPromptText = {
  text: string
  source:
    | 'prompt'
    | 'user_prompt'
    | 'userPrompt'
    | 'initial_prompt'
    | 'initialPrompt'
    | 'user_message'
    | 'message'
    | 'role_user_text'
    | null
}

// Joins the `text` of an Anthropic-style content-block array ([{ type: 'text',
// text }, ...]); plain string items are included too. Returns '' when nothing
// textual is present so callers can fall through to the next prompt source.
export function contentBlockArrayText(value: unknown[]): string {
  const parts: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      parts.push(item)
      continue
    }
    if (item && typeof item === 'object') {
      const text = (item as Record<string, unknown>).text
      if (typeof text === 'string') {
        parts.push(text)
      }
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export function extractPromptText(hookPayload: Record<string, unknown>): ExtractedPromptText {
  const candidateKeys = [
    'prompt',
    'user_prompt',
    'userPrompt',
    'initial_prompt',
    'initialPrompt',
    'user_message',
    'message'
  ]
  for (const key of candidateKeys) {
    const value = hookPayload[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      // Why: trim so prompts match what readStringField produces elsewhere —
      // surrounding whitespace would otherwise leak into UI and caches.
      return { text: value.trim(), source: key as Exclude<ExtractedPromptText['source'], null> }
    }
    // Why: Kimi Code sends UserPromptSubmit `prompt` as a content-block array
    // ([{ type: 'text', text }]) rather than a string. Extract its text for the
    // genuine prompt keys. `message` stays string-only: it is the ambiguous
    // status/permission field that hasExplicitUserPrompt intentionally distrusts.
    if (key !== 'message' && Array.isArray(value)) {
      const text = contentBlockArrayText(value)
      if (text.length > 0) {
        return { text, source: key as Exclude<ExtractedPromptText['source'], null> }
      }
    }
  }
  // Why: OpenCode's plugin sends MessagePart events with { role, text }. When
  // role === 'user', the text *is* the prompt — surface it even though
  // OpenCode has no UserPromptSubmit-equivalent.
  if (hookPayload.role === 'user' && typeof hookPayload.text === 'string') {
    const trimmed = capOpenCodeHookText(hookPayload.text.trim())
    if (trimmed.length > 0) {
      return { text: trimmed, source: 'role_user_text' }
    }
  }
  return { text: '', source: null }
}

export function stripGrokUserQueryWrapper(promptText: string): string {
  const opener = '<user_query>'
  if (!promptText.startsWith(opener)) {
    return promptText
  }
  const closer = '</user_query>'
  const wrappedText = promptText.slice(opener.length)
  const text = wrappedText.endsWith(closer) ? wrappedText.slice(0, -closer.length) : wrappedText
  // Why: Grok emits the submitted prompt wrapped in its internal
  // `<user_query>` envelope; the status cache should hold the user text.
  return text.trim()
}
