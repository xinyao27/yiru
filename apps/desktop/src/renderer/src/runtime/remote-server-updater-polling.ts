import type { RemoteServerUpdaterSnapshot } from '../../../shared/remote-server-update'

type PollingTransport = {
  getUpdaterStatus: (environmentId: string) => Promise<RemoteServerUpdaterSnapshot>
  now?: () => number
  wait: (milliseconds: number) => Promise<void>
}

type PollingTiming = {
  operationTimeoutMs: number
  pollIntervalMs: number
}

export async function pollRemoteServerUpdater(
  environmentId: string,
  expectedRuntimeId: string,
  transport: PollingTransport,
  timing: PollingTiming,
  accept: (snapshot: RemoteServerUpdaterSnapshot) => boolean,
  onSnapshot: (snapshot: RemoteServerUpdaterSnapshot) => void
): Promise<RemoteServerUpdaterSnapshot> {
  const now = transport.now ?? Date.now
  const deadline = now() + timing.operationTimeoutMs
  while (now() < deadline) {
    const snapshot = await transport.getUpdaterStatus(environmentId)
    // Why: a saved endpoint can be rebound while an operation is in flight;
    // never carry a download/install across runtime ownership generations.
    if (snapshot.runtimeId !== expectedRuntimeId) {
      throw new Error('remote_update_runtime_changed')
    }
    if (snapshot.status.state === 'error') {
      throw new Error(snapshot.status.message)
    }
    onSnapshot(snapshot)
    if (accept(snapshot)) {
      return snapshot
    }
    await transport.wait(Math.min(timing.pollIntervalMs, Math.max(0, deadline - now())))
  }
  throw new Error('remote_update_updater_timeout')
}
