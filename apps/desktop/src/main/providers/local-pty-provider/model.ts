import type { PtySpawnOptions } from '../types'

export type LocalPtyProviderOptions = {
  /** Why: `ctx.command` carries the renderer-chosen launch command (e.g. `pi`,
   *  `omp`, `claude`). Pi vs OMP must drive overlay source-dir selection in
   *  `buildPtyHostEnv` — a cross-agent disk-presence fallback silently
   *  shadows the other agent's user extensions when both are installed. */
  buildSpawnEnv?: (
    id: string,
    baseEnv: Record<string, string>,
    ctx?: {
      command?: string
      launchAgent?: PtySpawnOptions['launchAgent']
      shellPath?: string
      isWsl?: boolean
      wslDistro?: string | null
    }
  ) => Record<string, string>
  /** Whether worktree-scoped shell history is enabled. When true (or absent)
   *  and a worktreeId is provided, HISTFILE is scoped per-worktree. */
  isHistoryEnabled?: () => boolean
  /** Why: COMSPEC is always cmd.exe on a stock Windows machine, so reading it
   *  directly would ignore the user's shell preference. This callback lets the
   *  IPC layer inject the persisted setting without coupling the provider to the
   *  settings store. Returns undefined when no preference is set. */
  getWindowsShell?: () => string | undefined
  getWindowsPowerShellImplementation?: () => 'auto' | 'powershell.exe' | 'pwsh.exe' | undefined
  pwshAvailable?: () => boolean
  onSpawned?: (id: string) => void
  onExit?: (id: string, code: number) => void
}
