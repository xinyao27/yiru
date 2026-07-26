import type { CoworkingConnectionState } from '../../shared/coworking/wire-contract'

export class CoworkingPeerStatePublisher {
  private readonly listeners = new Set<(state: CoworkingConnectionState) => void>()

  subscribe(listener: (state: CoworkingConnectionState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(state: CoworkingConnectionState): void {
    for (const listener of this.listeners) {
      listener(state)
    }
  }
}
