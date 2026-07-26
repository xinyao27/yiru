import type { TuiAgent } from './types'

export type FridaySession = {
  agent: TuiAgent
  handle: string
  paneKey: string
  ptyId: string
  tabId: string
  worktreeId: string
}
