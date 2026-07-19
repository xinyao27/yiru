export type LanguageServerManagerStatus = {
  key: string
  worktreeId: string
  state: 'starting' | 'ready' | 'failed' | 'stopped'
  message?: string
  serverName?: string
  hostLabel?: string
  updatedAt: number
}

export type LanguageServerManagerSnapshot = {
  sessions: LanguageServerManagerStatus[]
}
