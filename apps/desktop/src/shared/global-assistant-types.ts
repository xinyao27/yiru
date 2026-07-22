import type { TuiAgent } from './types'

export type GlobalAssistantSession = {
  agent: TuiAgent
  handle: string
  paneKey: string
  ptyId: string
  tabId: string
  worktreeId: string
}
