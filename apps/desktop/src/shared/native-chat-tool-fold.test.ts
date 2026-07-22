import { describe, expect, it } from 'vite-plus/test'

import { foldToolMessages } from './native-chat-tool-fold'
import type { NativeChatMessage } from './native-chat-types'

function assistant(id: string, text: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp: null,
    source: 'transcript'
  }
}

describe('foldToolMessages', () => {
  it('renders consecutive assistant updates as one response turn', () => {
    const folded = foldToolMessages([
      assistant('commentary-1', 'Starting.'),
      assistant('commentary-2', 'Still working.'),
      assistant('final', 'Done.')
    ])

    expect(folded).toHaveLength(1)
    expect(folded[0]?.blocks).toEqual([
      { type: 'text', text: 'Starting.' },
      { type: 'text', text: 'Still working.' },
      { type: 'text', text: 'Done.' }
    ])
  })
})
