// Pure grouping logic for the native chat message list. Two jobs:
//   1. Order messages stably (timestamp then id; null timestamps sort first as
//      the shared model documents) — the assembler already sorts, but the list
//      re-sorts defensively so unordered caller data still reads correctly.
//   2. Within an assistant turn, pair each tool-call block with the tool-result
//      that answers it so the view can render one collapsible step instead of
//      two disconnected rows.

import {
  isToolCallBlock,
  isToolResultBlock,
  pairToolBlocks,
  type NativeChatBlock,
  type NativeChatMessage,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from '@yiru/workbench-model/agent'

import { compareMessages } from './session/assembler'

/** A tool-call block paired with the result that answered it, when one exists.
 *  `result` is null while the call is still in flight (no result yet). */
export type NativeChatToolStep = {
  call: NativeChatToolCallBlock
  result: NativeChatToolResultBlock | null
}

/** One renderable item in the list: either a prose/role message carrying its
 *  non-tool blocks, or a tool step (call + optional result). The view renders
 *  each variant differently. */
export type NativeChatRenderItem =
  | {
      kind: 'message'
      id: string
      message: NativeChatMessage
      /** The message's blocks minus tool-call/tool-result (those become steps). */
      blocks: NativeChatBlock[]
    }
  | {
      kind: 'tool-step'
      id: string
      /** Role of the message the call originated from (assistant/tool). */
      role: NativeChatMessage['role']
      timestamp: number | null
      step: NativeChatToolStep
    }

/** Order messages stably: null timestamps first (model rule), then ascending
 *  timestamp, ties broken by id. Shares the assembler's comparator so both
 *  paths order identically. */
export function orderNativeChatMessages(messages: NativeChatMessage[]): NativeChatMessage[] {
  return [...messages].sort(compareMessages)
}

function pairResultsByCall(
  messages: NativeChatMessage[]
): Map<NativeChatToolCallBlock, NativeChatToolResultBlock | null> {
  const toolBlocks: NativeChatBlock[] = []
  for (const message of messages) {
    for (const block of message.blocks) {
      if (isToolCallBlock(block) || isToolResultBlock(block)) {
        toolBlocks.push(block)
      }
    }
  }
  const resultsByCall = new Map<NativeChatToolCallBlock, NativeChatToolResultBlock | null>()
  for (const pair of pairToolBlocks(toolBlocks)) {
    if (pair.call) {
      resultsByCall.set(pair.call, pair.result ?? null)
    }
  }
  return resultsByCall
}

// Why: older transcripts without call IDs retain FIFO result pairing.
export function buildNativeChatRenderItems(messages: NativeChatMessage[]): NativeChatRenderItem[] {
  const ordered = orderNativeChatMessages(messages)
  const resultsByCall = pairResultsByCall(ordered)

  const items: NativeChatRenderItem[] = []
  for (const message of ordered) {
    const nonToolBlocks: NativeChatBlock[] = []
    const steps: NativeChatToolStep[] = []

    for (const block of message.blocks) {
      if (isToolCallBlock(block)) {
        const result = resultsByCall.get(block) ?? null
        steps.push({ call: block, result })
      } else if (isToolResultBlock(block)) {
        // Results are emitted as steps from the call side; skip standalone ones.
        continue
      } else {
        nonToolBlocks.push(block)
      }
    }

    if (nonToolBlocks.length > 0) {
      items.push({ kind: 'message', id: message.id, message, blocks: nonToolBlocks })
    }
    for (const [index, step] of steps.entries()) {
      items.push({
        kind: 'tool-step',
        id: `${message.id}:tool:${index}`,
        role: message.role,
        timestamp: message.timestamp,
        step
      })
    }
  }
  return items
}
