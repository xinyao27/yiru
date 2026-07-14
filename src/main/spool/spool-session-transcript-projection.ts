import type { NativeChatBlock, NativeChatMessage } from '../../shared/native-chat-types'
import {
  SPOOL_SESSION_TRANSCRIPT_MAX_BLOCK_CHARS,
  SPOOL_SESSION_TRANSCRIPT_MAX_MESSAGES,
  type SpoolSessionReadResult,
  type SpoolSessionTranscriptBlock,
  type SpoolSessionTranscriptMessage
} from '../../shared/spool/spool-operation-contract'

const MAX_BLOCKS_PER_MESSAGE = 100
const MAX_TOTAL_CHARS = 4 * 1024 * 1024
const TRUNCATION_MARKER = '\n… (truncated)'

export function projectSpoolSessionTranscript(
  messages: readonly NativeChatMessage[]
): SpoolSessionReadResult {
  const candidates = messages.slice(-SPOOL_SESSION_TRANSCRIPT_MAX_MESSAGES)
  const projected: SpoolSessionTranscriptMessage[] = []
  let totalChars = 0
  let truncated = candidates.length !== messages.length
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const result = projectMessage(candidates[index]!)
    truncated ||= result.truncated
    if (projected.length > 0 && totalChars + result.characters > MAX_TOTAL_CHARS) {
      truncated = true
      break
    }
    projected.push(result.message)
    totalChars += result.characters
  }
  return { messages: projected.toReversed(), truncated }
}

function projectMessage(message: NativeChatMessage): {
  message: SpoolSessionTranscriptMessage
  characters: number
  truncated: boolean
} {
  const blocks = message.blocks.slice(0, MAX_BLOCKS_PER_MESSAGE).map(projectBlock)
  return {
    message: {
      role: message.role,
      blocks: blocks.map((entry) => entry.block),
      timestamp: message.timestamp
    },
    characters: blocks.reduce((total, entry) => total + entry.characters, 0),
    truncated:
      blocks.some((entry) => entry.truncated) || message.blocks.length > MAX_BLOCKS_PER_MESSAGE
  }
}

function projectBlock(block: NativeChatBlock): {
  block: SpoolSessionTranscriptBlock
  characters: number
  truncated: boolean
} {
  if (block.type === 'text') {
    const text = clip(block.text)
    return { block: { type: 'text', text: text.value }, ...text }
  }
  if (block.type === 'tool-result') {
    const output = clip(block.output)
    return {
      block: { type: 'tool-result', output: output.value, isError: block.isError === true },
      ...output
    }
  }
  if (block.type === 'tool-call') {
    const input = clip(stringifyInput(block.input))
    const name = clip(block.name)
    return {
      block: { type: 'tool-call', name: name.value, input: input.value },
      characters: name.characters + input.characters,
      truncated: name.truncated || input.truncated
    }
  }
  const alt = block.alt ? clip(block.alt) : null
  // Why: owner filesystem paths and signed image URLs are locator data, not transcript text.
  return {
    block: { type: 'image', alt: alt?.value ?? null },
    characters: alt?.characters ?? 0,
    truncated: Boolean(block.path || block.url || alt?.truncated)
  }
}

function stringifyInput(input: unknown): string {
  try {
    const serialized = JSON.stringify(input)
    return serialized === undefined ? String(input) : serialized
  } catch {
    return '[unavailable]'
  }
}

function clip(value: string): { value: string; characters: number; truncated: boolean } {
  if (value.length <= SPOOL_SESSION_TRANSCRIPT_MAX_BLOCK_CHARS) {
    return { value, characters: value.length, truncated: false }
  }
  const clipped = value.slice(0, SPOOL_SESSION_TRANSCRIPT_MAX_BLOCK_CHARS) + TRUNCATION_MARKER
  return { value: clipped, characters: clipped.length, truncated: true }
}
