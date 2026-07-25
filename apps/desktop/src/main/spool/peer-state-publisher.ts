import type { SpoolConnectionState } from '../../shared/spool/spool-wire-contract'

export class SpoolPeerStatePublisher {
  private readonly listeners = new Set<(state: SpoolConnectionState) => void>()

  subscribe(listener: (state: SpoolConnectionState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(state: SpoolConnectionState): void {
    for (const listener of this.listeners) {
      listener(state)
    }
  }
}
