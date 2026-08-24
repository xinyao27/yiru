import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  createAuthFilesystemOperation,
  type SharedAuthFilesystemOperation
} from './auth-filesystem-operation'
import type { FetchCodexRateLimitsOptions } from './codex-rate-limit-options'

const BACKEND_TIMEOUT_MS = 10000

type AuthFile = {
  tokens?: {
    access_token?: string
    account_id?: string
  }
}

type AuthReadResult = { content: string; error?: never } | { content?: never; error: unknown }

const authReadByPath = new Map<string, SharedAuthFilesystemOperation<AuthReadResult>>()

export function createCodexBackendRequestSignal(
  callerSignal?: AbortSignal,
  timeoutMs = BACKEND_TIMEOUT_MS
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal
}

export async function getCodexBackendAuthHeaders(
  options: FetchCodexRateLimitsOptions | undefined,
  signal: AbortSignal
): Promise<Record<string, string> | null> {
  if (signal.aborted) {
    return null
  }
  const authPath = join(getCodexHomePath(options?.codexHomePath), 'auth.json')
  const auth = JSON.parse(await readBackendAuth(authPath, signal)) as AuthFile
  const accessToken = auth.tokens?.access_token
  if (!accessToken) {
    return null
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'codex-cli',
    'OpenAI-Beta': 'codex-1',
    originator: 'Codex Desktop'
  }
  if (auth.tokens?.account_id) {
    headers['ChatGPT-Account-Id'] = auth.tokens.account_id
  }
  return headers
}

function getCodexHomePath(codexHomePath?: string | null): string {
  return codexHomePath ?? process.env.CODEX_HOME ?? join(homedir(), '.codex')
}

function getBackendAuthRead(authPath: string): SharedAuthFilesystemOperation<AuthReadResult> {
  const existing = authReadByPath.get(authPath)
  if (existing) {
    return existing
  }
  // Why: UNC reads cannot be reliably cancelled, so callers share the in-flight operation.
  const read = createAuthFilesystemOperation(authPath, () =>
    readFile(authPath, 'utf8').then(
      (content) => ({ content }),
      (error: unknown) => ({ error })
    )
  )
  authReadByPath.set(authPath, read)
  const clearRead = (): void => {
    if (authReadByPath.get(authPath) === read) {
      authReadByPath.delete(authPath)
    }
  }
  void read.result.then(clearRead, clearRead)
  return read
}

async function readBackendAuth(authPath: string, signal: AbortSignal): Promise<string> {
  const result = await getBackendAuthRead(authPath).wait(signal)
  if ('error' in result) {
    throw result.error
  }
  return result.content
}
