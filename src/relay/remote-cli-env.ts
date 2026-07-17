export function pickRemoteCliEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const picked: Record<string, string> = {}
  for (const key of [
    'YIRU_TERMINAL_HANDLE',
    'YIRU_WORKTREE_ID',
    'YIRU_PANE_KEY',
    'YIRU_WORKSPACE_ID',
    'YIRU_USER_DATA_PATH',
    'PATH',
    'Path'
  ]) {
    const value = env[key]
    if (typeof value === 'string') {
      picked[key] = value
    }
  }
  return picked
}
