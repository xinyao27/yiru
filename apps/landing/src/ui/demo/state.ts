export type TabId = 'claude' | 'diff' | 'browser'

export type WorktreeStatus = 'idle' | 'running' | 'review' | 'merged'

export type AgentRow = {
  name: string
  detail: string
}

export type WorktreeRow = {
  branch: string
  status: WorktreeStatus
  active: boolean
  agents: AgentRow[]
}

export type CursorPoint = {
  /** Percentage of the window box, so the cursor tracks any width. */
  x: number
  y: number
}

/** Why: a pane column is a tab group with its own strip and one active tab —
    splitting moves a tab into a new group (see tab-move-to-pane-column.ts). */
export type PaneGroup = {
  tabs: TabId[]
  activeTab: TabId
}

export type DemoState = {
  worktrees: WorktreeRow[]
  groups: PaneGroup[]
  promptChars: number
  working: boolean
  elapsedSeconds: number
  tokens: number
  diffLines: number
  checksVisible: boolean
  /** Shared by both surfaces — the phone drives it, the desktop mirrors it. */
  browserReloading: boolean
  browserFresh: boolean
  composerText: string
  composerActive: boolean
  touchOnPhone: boolean
  followUp: string | null
  followUpWorking: boolean
  cursor: CursorPoint
  cursorPressed: boolean
  phoneVisible: boolean
}

export const PROJECT_NAME = 'storefront'
export const ACTIVE_BRANCH = 'fix/stale-search'
export const AGENT_LABEL = 'Claude Code'
export const AGENT_MODEL = 'Opus 5'
export const AGENT_CWD = '~/code/storefront'
export const PROMPT = 'search results come back stale'
export const FOLLOW_UP = 'add a test for the race'

export const SEARCH_QUERY = 'running shoes'

export type SearchResult = {
  name: string
  price: string
}

// Why: before the fix the rows answer the previous query — that mismatch is
// what a stale-results race actually looks like on screen.
export const STALE_RESULTS: SearchResult[] = [
  { name: 'Wool beanie', price: '$24' },
  { name: 'Knit scarf', price: '$32' },
  { name: 'Lined gloves', price: '$28' }
]

export const FRESH_RESULTS: SearchResult[] = [
  { name: 'Trail runner', price: '$120' },
  { name: 'Road runner', price: '$95' },
  { name: 'Track spike', price: '$89' }
]

export const BASE_WORKTREES: WorktreeRow[] = [
  { branch: 'feat/apple-pay', status: 'running', active: false, agents: [] },
  { branch: 'fix/cart-total', status: 'review', active: false, agents: [] },
  { branch: 'chore/bump-deps', status: 'merged', active: false, agents: [] }
]

export type DiffLine = {
  kind: 'add' | 'del' | 'context' | 'meta'
  number: number
  text: string
  /** Character range that actually changed, for the word-level emphasis tier. */
  emphasis?: [number, number]
}

export const DIFF_FILE = 'search/use-search.ts'

export const DIFF_LINES: DiffLine[] = [
  { kind: 'meta', number: 0, text: '@@ -44,8 +44,8 @@ useSearch()' },
  { kind: 'context', number: 44, text: '  const [results, setResults] = useState([])' },
  { kind: 'context', number: 45, text: '  const [loading, setLoading] = useState(false)' },
  { kind: 'context', number: 46, text: '' },
  { kind: 'context', number: 47, text: '  const run = async (query) => {' },
  { kind: 'context', number: 48, text: '    setLoading(true)' },
  { kind: 'del', number: 49, text: '    const results = fetchResults(query)' },
  // Why: emphasis marks only the inserted keyword — that is the entire fix.
  {
    kind: 'add',
    number: 49,
    text: '    const results = await fetchResults(query)',
    emphasis: [20, 25]
  },
  { kind: 'context', number: 50, text: '    setResults(results)' },
  { kind: 'del', number: 51, text: '    setLoading(true)', emphasis: [15, 19] },
  { kind: 'add', number: 51, text: '    setLoading(false)', emphasis: [15, 20] },
  { kind: 'context', number: 52, text: '  }' }
]

export const TAB_LABELS: Record<TabId, string> = {
  claude: 'claude',
  diff: 'Diff',
  browser: 'Browser'
}

export const initialState: DemoState = {
  worktrees: BASE_WORKTREES,
  groups: [{ tabs: ['claude'], activeTab: 'claude' }],
  promptChars: 0,
  working: false,
  elapsedSeconds: 0,
  tokens: 0,
  diffLines: 0,
  checksVisible: false,
  browserReloading: false,
  browserFresh: false,
  composerText: '',
  composerActive: false,
  touchOnPhone: false,
  followUp: null,
  followUpWorking: false,
  cursor: { x: 58, y: 62 },
  cursorPressed: false,
  phoneVisible: false
}
