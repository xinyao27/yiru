import { app } from 'electron'

import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import type { Store } from '../persistence'
import { getDefaultWslDistro } from '../wsl'
import type { CodexRuntimeHomeService } from './accounts/runtime-home-service'
import type { CodexAccountSelectionTarget } from './accounts/runtime-selection'
import { codexHookService } from './hook-service'
import { ensureRealHomeCodexHookState } from './real-home-hook-install'

export function createCodexRuntimeLaunchPreparation(options: {
  getStore: () => Store | null
  getRuntimeHome: () => CodexRuntimeHomeService | null
}): (target?: CodexAccountSelectionTarget, launchEnv?: NodeJS.ProcessEnv) => string | null {
  return (target, launchEnv) => {
    const store = options.getStore()
    const runtimeHome = options.getRuntimeHome()
    if (!store || !runtimeHome) {
      throw new Error('Codex runtime home is not initialized')
    }
    const ensureRealHomeHooksIfSelected = (): boolean => {
      if (
        target?.runtime === 'wsl' ||
        !runtimeHome.isHostSystemDefaultRealHomeSelected(launchEnv)
      ) {
        return false
      }
      ensureRealHomeCodexHookState({
        hooksEnabled: isAgentStatusHooksEnabled(store.getSettings()),
        userDataPath: app.getPath('userData')
      })
      return true
    }
    let realHomeHooksPrepared = ensureRealHomeHooksIfSelected()
    let runtimeHomePath = runtimeHome.prepareForCodexLaunch(target, launchEnv)
    if (runtimeHomePath === null && !realHomeHooksPrepared) {
      realHomeHooksPrepared = ensureRealHomeHooksIfSelected()
      if (realHomeHooksPrepared) {
        runtimeHomePath = runtimeHome.prepareForCodexLaunch(target, launchEnv)
      }
    }
    if (runtimeHomePath === null && target?.runtime !== 'wsl') {
      return null
    }
    const hookTarget =
      target?.runtime === 'wsl'
        ? {
            runtime: 'wsl' as const,
            wslDistro: target.wslDistro?.trim() || getDefaultWslDistro()
          }
        : target
    const hooksEnabled = isAgentStatusHooksEnabled(store.getSettings())
    try {
      const status = hooksEnabled
        ? (codexHookService.installForRuntimeHome(runtimeHomePath, hookTarget) ??
          codexHookService.install(runtimeHomePath ?? undefined))
        : (codexHookService.refreshRuntimeUserHooksForRuntimeHome(runtimeHomePath, hookTarget) ??
          codexHookService.refreshRuntimeUserHooks(runtimeHomePath ?? undefined))
      if (status.state === 'error') {
        console.warn(
          `[codex-hook-service] failed to ${hooksEnabled ? 'refresh' : 'refresh user'} runtime hooks before launch`,
          status.detail
        )
      }
    } catch (error) {
      console.warn(
        `[codex-hook-service] failed to ${hooksEnabled ? 'refresh' : 'refresh user'} runtime hooks before launch`,
        error
      )
    }
    return runtimeHomePath
  }
}
