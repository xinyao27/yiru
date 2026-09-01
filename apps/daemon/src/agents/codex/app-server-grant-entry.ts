import { writeSync } from 'node:fs'

import { runCodexHookTrustGrantSession } from './app-server-client'
import {
  buildGrantEntryEnvelope,
  type CodexAppServerEntryRequest
} from './app-server-grant-envelope'
import { runCodexUserHookTrustRebaseSession } from './user-hook-trust-rebase-client'

const HARD_EXIT_MARGIN_MS = 2_000

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function runCodexAppServerGrantEntry(): Promise<void> {
  const raw = await readStdin()
  let request: CodexAppServerEntryRequest
  try {
    request = JSON.parse(raw) as CodexAppServerEntryRequest
  } catch (error) {
    writeEnvelope({
      ok: false,
      errorName: 'Error',
      message: `invalid trust-grant request JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    })
    return
  }

  // Why: process suspension can prevent the session deadline from firing;
  // this backstop closes the nested Codex process through stdio EOF.
  const hardExit = setTimeout(() => {
    writeSync(
      process.stdout.fd,
      `${JSON.stringify({
        ok: false,
        errorName: 'CodexAppServerTimeoutError',
        message: `trust-grant entry hard deadline (${
          request.invocation.timeoutMs + HARD_EXIT_MARGIN_MS
        }ms) elapsed`
      })}\n`
    )
    process.exit(3)
  }, request.invocation.timeoutMs + HARD_EXIT_MARGIN_MS)
  const run =
    'operation' in request
      ? runCodexUserHookTrustRebaseSession(request)
      : runCodexHookTrustGrantSession(request)
  const envelope = await buildGrantEntryEnvelope(run)
  clearTimeout(hardExit)
  writeEnvelope(envelope)
}

function writeEnvelope(envelope: unknown): void {
  process.stdout.write(`${JSON.stringify(envelope)}\n`)
}
