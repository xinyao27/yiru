import {
  isToolCallBlock,
  isToolResultBlock,
  type NativeChatBlock,
  type NativeChatMessage,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from './native-chat-types'

function isToolOnlyMessage(message: NativeChatMessage): boolean {
  return (
    message.blocks.length > 0 &&
    message.blocks.every((block) => isToolCallBlock(block) || isToolResultBlock(block))
  )
}

/** Fold consecutive assistant updates and tool-only records into one response turn. */
export function foldToolMessages(messages: readonly NativeChatMessage[]): NativeChatMessage[] {
  const output: NativeChatMessage[] = []
  let mutableAssistantIndex = -1
  for (const message of messages) {
    const previous = output.at(-1)
    // Why: providers emit commentary, tool activity, and the final answer as
    // separate records even though they answer one user turn.
    const continuesAssistantTurn =
      previous?.role === 'assistant' && (message.role === 'assistant' || isToolOnlyMessage(message))
    if (continuesAssistantTurn) {
      const index = output.length - 1
      if (mutableAssistantIndex !== index) {
        output[index] = { ...previous, blocks: [...previous.blocks] }
        mutableAssistantIndex = index
      }
      output[index]!.blocks.push(...message.blocks)
    } else {
      output.push(message)
      mutableAssistantIndex = -1
    }
  }
  return output
}

export type NativeChatToolPair = {
  call?: NativeChatToolCallBlock
  result?: NativeChatToolResultBlock
}

// Why: older transcripts without provider IDs still require FIFO result pairing.
export function pairToolBlocks(
  blocks: readonly NativeChatBlock[],
  limit = Infinity
): NativeChatToolPair[] {
  const pairs: NativeChatToolPair[] = []
  const calls: {
    pairIndex: number | null
    hasResult: boolean
  }[] = []
  const callIndexById = new Map<string, number>()
  const results: NativeChatToolResultBlock[] = []
  for (const block of blocks) {
    if (block.type === 'tool-call') {
      const pairIndex = pairs.length < limit ? pairs.length : null
      const callIndex = calls.length
      if (pairs.length < limit) {
        pairs.push({ call: block })
      }
      calls.push({ pairIndex, hasResult: false })
      if (block.callId && !callIndexById.has(block.callId)) {
        callIndexById.set(block.callId, callIndex)
      }
      continue
    }
    if (block.type === 'tool-result') {
      results.push(block)
    }
  }

  for (const result of results) {
    if (!result.callId) {
      continue
    }
    const callIndex = callIndexById.get(result.callId)
    const call = callIndex === undefined ? undefined : calls[callIndex]
    if (!call || call.hasResult) {
      continue
    }
    call.hasResult = true
    if (call.pairIndex !== null) {
      pairs[call.pairIndex]!.result = result
    }
  }

  let fallbackCallIndex = 0
  for (const result of results) {
    if (result.callId && callIndexById.has(result.callId)) {
      continue
    }
    if (!result.callId) {
      while (calls[fallbackCallIndex]?.hasResult) {
        fallbackCallIndex += 1
      }
      const call = calls[fallbackCallIndex]
      if (call) {
        call.hasResult = true
        fallbackCallIndex += 1
        if (call.pairIndex !== null) {
          pairs[call.pairIndex]!.result = result
        }
        continue
      }
    }
    if (pairs.length < limit) {
      pairs.push({ result })
    }
  }
  return pairs
}

export function splitNativeChatBlocks(blocks: readonly NativeChatBlock[]): {
  prose: NativeChatBlock[]
  tools: NativeChatBlock[]
} {
  const prose: NativeChatBlock[] = []
  const tools: NativeChatBlock[] = []
  for (const block of blocks) {
    if (isToolCallBlock(block) || isToolResultBlock(block)) {
      tools.push(block)
    } else {
      prose.push(block)
    }
  }
  return { prose, tools }
}
