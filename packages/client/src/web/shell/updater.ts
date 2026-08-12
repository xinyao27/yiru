import type { ShellUpdaterApi } from '../../runtime/shell-system-client'

const noopUnsubscribe = (): void => {}

export function createWebShellUpdaterApi(): ShellUpdaterApi {
  return {
    getVersion: () => Promise.resolve('web'),
    getStatus: () => Promise.resolve({ state: 'idle' }),
    check: () => Promise.resolve(),
    download: () => Promise.resolve(),
    quitAndInstall: () => Promise.resolve(),
    dismissNudge: () => Promise.resolve(),
    onStatus: () => noopUnsubscribe,
    onClearDismissal: () => noopUnsubscribe
  }
}
