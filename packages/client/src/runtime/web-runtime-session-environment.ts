import { useAppStore } from '../store/state'

export function isWebRuntimeSessionActive(
  activeRuntimeEnvironmentId: string | null | undefined
): boolean {
  // Why: headless serve sessions are owned by the selected runtime regardless
  // of whether the attaching client is web or desktop Electron.
  return Boolean(activeRuntimeEnvironmentId?.trim())
}

export function resolveWebRuntimeSessionEnvironmentId(
  environmentId: string | null | undefined
): string | null {
  const resolved =
    environmentId?.trim() ??
    useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim() ??
    null
  return isWebRuntimeSessionActive(resolved) ? resolved : null
}
