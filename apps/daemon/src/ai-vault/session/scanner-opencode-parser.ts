import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { AiVaultSession } from '@yiru/runtime-protocol/model/agent'

import {
  addPreviewMessage,
  addSessionTokens,
  createAccumulator,
  finalizeSession,
  sessionIdFromFileName,
  updateTimeline
} from './scanner-accumulator'
import type { FileWithMtime, SessionAccumulator } from './scanner-types'
import {
  asRecord,
  extractPreviewContentText,
  extractString,
  findOpenCodeStorageRoot,
  normalizeTitleText,
  timeObjectValue,
  tokenTotal
} from './scanner-values'

export async function parseOpenCodeSessionFile(
  file: FileWithMtime,
  platform: NodeJS.Platform = process.platform
): Promise<AiVaultSession | null> {
  const record = asRecord(JSON.parse(await readFile(file.path, 'utf-8')) as unknown)
  if (!record) {
    return null
  }
  const sessionId = extractString(record.id) ?? sessionIdFromFileName(file.path)
  const accumulator = createAccumulator({ agent: 'opencode', file, sessionId })
  accumulator.title = normalizeTitleText(extractString(record.title) ?? '')
  accumulator.cwd = extractString(record.directory)
  updateTimeline(accumulator, timeObjectValue(record.time, 'created'))
  updateTimeline(accumulator, timeObjectValue(record.time, 'updated'))
  await consumeOpenCodeMessages(accumulator, findOpenCodeStorageRoot(file.path), sessionId)
  return finalizeSession(accumulator, platform)
}

export async function consumeOpenCodeMessages(
  accumulator: SessionAccumulator,
  storageRoot: string | null,
  sessionId: string
): Promise<void> {
  if (!storageRoot) {
    return
  }
  const messageDir = join(storageRoot, 'message', sessionId)
  let entries
  try {
    entries = await readdir(messageDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }
    const message = asRecord(
      JSON.parse(await readFile(join(messageDir, entry.name), 'utf-8')) as unknown
    )
    if (!message) {
      continue
    }
    const role = extractString(message.role)
    if (role === 'user' || role === 'assistant') {
      accumulator.messageCount++
      updateTimeline(accumulator, timeObjectValue(message.time, 'created'))
      if (role === 'user') {
        accumulator.title ??= extractString(asRecord(message.summary)?.title)
        accumulator.title ??= extractString(asRecord(message.summary)?.body)
      }
      addPreviewMessage(accumulator, {
        role,
        text:
          extractPreviewContentText(message.content) ??
          extractString(asRecord(message.summary)?.body) ??
          extractString(asRecord(message.summary)?.title),
        timestamp: timeObjectValue(message.time, 'created')
      })
      accumulator.model =
        extractString(asRecord(message.model)?.modelID) ||
        extractString(message.modelID) ||
        accumulator.model
      addSessionTokens(
        accumulator,
        tokenTotal(message.tokens),
        timeObjectValue(message.time, 'created')
      )
    }
  }
}
