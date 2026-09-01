import { useAppStore } from '../store/state'

export function isRemoteRuntimeSessionActive(
  activeRuntimeEnvironmentId: string | null | undefined
): boolean {
  // Why: headless serve sessions are owned by the selected runtime regardless
  // regardless of which browser or mobile client attaches.
  return Boolean(activeRuntimeEnvironmentId?.trim())
}

export function resolveRemoteRuntimeSessionEnvironmentId(
  environmentId: string | null | undefined
): string | null {
  const resolved =
    environmentId?.trim() ??
    useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim() ??
    null
  return isRemoteRuntimeSessionActive(resolved) ? resolved : null
}
