import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { RemoteHostPlatform } from '../ssh/ssh-remote-platform'
import {
  consumeCodexSessionLine,
  createCodexSessionParseState,
  finalizeCodexSessionParseState
} from './session-scanner-codex-parser'
import {
  consumeClaudeSessionLine,
  createClaudeSessionParseState,
  finalizeClaudeSessionParseState
} from './session-scanner-primary-parsers'
import type { FileWithMtime } from './session-scanner-types'
import { remoteCodexIndexTitles } from './remote-session-scanner-codex-index'
import type { RemoteScannerContext } from './remote-session-scanner-types'

export async function parseRemoteClaudeSessionStream(
  file: FileWithMtime,
  context: RemoteScannerContext,
  signal: AbortSignal
): Promise<AiVaultSession | null> {
  const state = createClaudeSessionParseState(file)
  await consumeRemoteSessionInventoryLines(file, context, signal, (line) =>
    consumeClaudeSessionLine(state, line)
  )
  signal.throwIfAborted()
  return finalizeClaudeSessionParseState(state, context.hostPlatform.os, {
    executionHostId: context.executionHostId,
    executionHostPlatform: context.hostPlatform.os
  })
}

export async function parseRemoteCodexSessionStream(
  file: FileWithMtime,
  context: RemoteScannerContext,
  signal: AbortSignal,
  codexHome: string,
  hostPlatform: RemoteHostPlatform
): Promise<AiVaultSession | null> {
  const state = createCodexSessionParseState(file)
  await consumeRemoteSessionInventoryLines(file, context, signal, (line) =>
    consumeCodexSessionLine(state, line)
  )
  signal.throwIfAborted()
  return finalizeCodexSessionParseState(state, context.hostPlatform.os, {
    codexHome,
    executionHostId: context.executionHostId,
    executionHostPlatform: context.hostPlatform.os,
    titleReader: async (sessionId) =>
      (
        await remoteCodexIndexTitles({
          provider: context.provider,
          codexHome,
          hostPlatform,
          titleCaches: context.titleCaches
        })
      ).get(sessionId) ?? null
  })
}

async function consumeRemoteSessionInventoryLines(
  file: FileWithMtime,
  context: RemoteScannerContext,
  signal: AbortSignal,
  consumeLine: (line: string) => void
): Promise<void> {
  if (!context.provider.consumeSessionInventoryJsonLines) {
    throw new Error('Remote session inventory streaming is unavailable')
  }
  signal.throwIfAborted()
  await context.provider.consumeSessionInventoryJsonLines(file.path, consumeLine, { signal })
  signal.throwIfAborted()
}
