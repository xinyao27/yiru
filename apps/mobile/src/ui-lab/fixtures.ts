import type { NativeChatMessage } from '@yiru/workbench-model/agent'

export const UI_LAB_HOST_PREFIX = 'ui-lab-'
export const UI_LAB_TERMINAL_TAB_ID = 'ui-lab-terminal-tab'
export const UI_LAB_TERMINAL_HANDLE = 'ui-lab-terminal'
export const UI_LAB_SESSION_ID = 'ui-lab-session'

const UI_LAB_SCENARIO_IDS = ['chat', 'working', 'permission', 'empty', 'error', 'markdown'] as const
export type MobileUiLabScenarioId = (typeof UI_LAB_SCENARIO_IDS)[number]

export type MobileUiLabScenario = {
  id: MobileUiLabScenarioId
  title: string
  description: string
  surface: 'chat' | 'markdown'
}

export const UI_LAB_SCENARIOS = [
  {
    id: 'chat',
    title: 'Chat transcript',
    description: 'Messages, Markdown, math, queued input, tool calls, and the composer.',
    surface: 'chat'
  },
  {
    id: 'working',
    title: 'Agent working',
    description: 'Streaming assistant text, activity indicator, and the Stop action.',
    surface: 'chat'
  },
  {
    id: 'permission',
    title: 'Permission request',
    description: 'A blocked agent with the real native permission card.',
    surface: 'chat'
  },
  {
    id: 'empty',
    title: 'Empty chat',
    description: 'The first-message state inside the production session chrome.',
    surface: 'chat'
  },
  {
    id: 'error',
    title: 'Chat error',
    description: 'Transcript failure copy while the terminal remains connected.',
    surface: 'chat'
  },
  {
    id: 'markdown',
    title: 'Markdown tab',
    description: 'A real session Markdown tab with tables, code, file paths, and math.',
    surface: 'markdown'
  }
] as const satisfies readonly MobileUiLabScenario[]

export function mobileUiLabHostId(scenario: MobileUiLabScenarioId): string {
  return `${UI_LAB_HOST_PREFIX}${scenario}`
}

export function mobileUiLabScenarioFromHostId(hostId: string): MobileUiLabScenarioId | null {
  if (!__DEV__ || !hostId.startsWith(UI_LAB_HOST_PREFIX)) {
    return null
  }
  const candidate = hostId.slice(UI_LAB_HOST_PREFIX.length)
  return UI_LAB_SCENARIO_IDS.find((scenario) => scenario === candidate) ?? null
}

export const UI_LAB_MARKDOWN = [
  '# Markdown renderer',
  '',
  'Body text with **bold**, *italic*, ~~strikethrough~~, `inline code`, and a',
  '[safe link](https://example.com). A detected project path should also be tappable:',
  '`apps/mobile/src/components/markdown.tsx:163`.',
  '',
  '> Blockquotes use the same quiet border and surface tokens as the production chat.',
  '',
  '## Lists and tasks',
  '',
  '- A short unordered item',
  '- A wrapped item that is deliberately long enough to exercise line wrapping on a narrow phone',
  '  without pushing the conversation wider than the viewport',
  '',
  '1. First ordered item',
  '2. Second ordered item',
  '',
  '- [x] Native renderer installed',
  '- [ ] Check both light and dark appearances',
  '',
  '## Table',
  '',
  '| Surface | State | Notes |',
  '| --- | --- | --- |',
  '| Chat | Ready | Production component |',
  '| Markdown | Working | Native rendering |',
  '| Composer | Interactive | Local echo only |',
  '',
  '## Code',
  '',
  '```tsx',
  'export function Greeting({ name }: { name: string }) {',
  '  return <Text>Hello, {name}</Text>',
  '}',
  '```',
  '',
  '## Math',
  '',
  'Inline math: $E = mc^2$.',
  '',
  '$$',
  '\\int_0^1 x^2\\,dx = \\frac{1}{3}',
  '$$',
  '',
  '---',
  '',
  '中文、emoji 与混合排版：你好 Yiru 👋 — this line checks multilingual wrapping.'
].join('\n')

export const UI_LAB_CHAT_MESSAGES = [
  {
    id: 'ui-lab-user-1',
    role: 'user',
    blocks: [
      {
        type: 'text',
        text: 'Review the mobile Markdown renderer and keep the implementation clean.'
      }
    ],
    timestamp: 1,
    source: 'transcript'
  },
  {
    id: 'ui-lab-reasoning-1',
    role: 'reasoning',
    blocks: [{ type: 'text', text: 'I’ll inspect the renderer and its theme integration.' }],
    timestamp: 2,
    source: 'transcript'
  },
  {
    id: 'ui-lab-assistant-1',
    role: 'assistant',
    blocks: [
      {
        type: 'text',
        text: `${UI_LAB_MARKDOWN}\n\nI also checked the production component directly.`
      },
      {
        type: 'tool-call',
        name: 'Read',
        input: { file_path: 'apps/mobile/src/components/markdown.tsx' }
      },
      {
        type: 'tool-result',
        output: 'Read 212 lines from apps/mobile/src/components/markdown.tsx'
      },
      {
        type: 'tool-call',
        name: 'Edit',
        input: {
          file_path: 'apps/mobile/src/components/markdown.tsx',
          old_string: 'latexMath: false',
          new_string: 'latexMath: true'
        }
      },
      {
        type: 'tool-result',
        output: 'Updated the Markdown renderer configuration.'
      }
    ],
    timestamp: 3,
    source: 'transcript'
  }
] satisfies NativeChatMessage[]

export const UI_LAB_FILE_PATHS = [
  'apps/mobile/src/components/markdown.tsx',
  'apps/mobile/src/session/native-chat/message.tsx',
  'apps/mobile/src/ui-lab/screen.tsx'
]
