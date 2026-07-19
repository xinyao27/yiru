const WSLENV_ENTRY_SEPARATOR = ':'

function parseWslenvEntries(value: string | undefined): string[] {
  return value ? value.split(WSLENV_ENTRY_SEPARATOR).filter(Boolean) : []
}

function upsertWslenvEntry(entries: string[], entry: string): void {
  const variableName = entry.split('/')[0]
  const existingIndex = entries.findIndex((value) => value.split('/')[0] === variableName)
  if (existingIndex === -1) {
    entries.push(entry)
    return
  }
  entries[existingIndex] = entry
}

export function addYiruWslInteropEnv(env: Record<string, string>): void {
  const entries = parseWslenvEntries(env.WSLENV)
  // Why: the endpoint is a Windows path (/p-translated so the guest reads it
  // via /mnt/c) until the WSL hook relay reports the guest home — then it is
  // already a guest-side POSIX path and must cross untranslated.
  const endpointFlag = env.YIRU_AGENT_HOOK_ENDPOINT?.startsWith('/') ? 'u' : 'p'
  // Why: wsl.exe only imports selected Windows env vars, so WSL needs the wrapper root, pane identity, and hook/OMP coordinates at start.
  const passthroughEntries = [
    'YIRU_TERMINAL_HANDLE/u',
    'YIRU_USER_DATA_PATH/p',
    'YIRU_CLI_COMMAND/u',
    'YIRU_PANE_KEY/u',
    'YIRU_TAB_ID/u',
    'YIRU_WORKTREE_ID/u',
    'YIRU_AGENT_LAUNCH_TOKEN/u',
    'YIRU_AGENT_HOOK_PORT/u',
    'YIRU_AGENT_HOOK_TOKEN/u',
    'YIRU_AGENT_HOOK_ENV/u',
    'YIRU_AGENT_HOOK_VERSION/u',
    `YIRU_AGENT_HOOK_ENDPOINT/${endpointFlag}`,
    'YIRU_WSL_HOOK_RELAY_VERSION/u',
    'YIRU_WSL_HOOK_INSTANCE/u',
    'YIRU_OMP_SOURCE_AGENT_DIR/p',
    'YIRU_OMP_STATUS_EXTENSION/p'
  ]
  for (const entry of passthroughEntries) {
    const variableName = entry.split('/')[0]
    if (env[variableName]) {
      upsertWslenvEntry(entries, entry)
    }
  }
  env.WSLENV = entries.join(WSLENV_ENTRY_SEPARATOR)
}
