import type { RuntimeTerminalDriverState } from '../../../shared/runtime-types'

type InputFloorClaim = {
  base: RuntimeTerminalDriverState
  generation: number
  committedGeneration: number
  pending: Map<symbol, { clientId: string; generation: number }>
}

type InputFloorPort = {
  getDriver(): RuntimeTerminalDriverState
  setDriver(driver: RuntimeTerminalDriverState): void
  commit(previousFloor: RuntimeTerminalDriverState, isCurrent: () => boolean): Promise<void>
}

export class TerminalMobileInputFloor {
  private readonly claims = new Map<string, InputFloorClaim>()

  begin(
    ptyId: string,
    clientId: string,
    port: InputFloorPort
  ): { commit: () => Promise<void>; rollback: () => void } {
    const claim = this.claims.get(ptyId) ?? {
      base: port.getDriver(),
      generation: 0,
      committedGeneration: 0,
      pending: new Map<symbol, { clientId: string; generation: number }>()
    }
    this.claims.set(ptyId, claim)
    const token = Symbol('mobile-input-floor')
    const generation = ++claim.generation
    claim.pending.set(token, { clientId, generation })
    port.setDriver({ kind: 'mobile', clientId })
    let settled = false

    return {
      commit: async () => {
        if (settled) {
          return
        }
        settled = true
        claim.pending.delete(token)
        // Why: a delayed older write cannot replace a newer committed floor.
        if (generation < claim.committedGeneration) {
          this.deleteIfSettled(ptyId, claim)
          return
        }
        const previousFloor = claim.base
        claim.committedGeneration = generation
        claim.base = { kind: 'mobile', clientId }
        await port.commit(
          previousFloor,
          () => this.claims.get(ptyId) === claim && claim.committedGeneration === generation
        )
        this.deleteIfSettled(ptyId, claim)
      },
      rollback: () => {
        if (settled) {
          return
        }
        settled = true
        claim.pending.delete(token)
        if (this.claims.get(ptyId) !== claim) {
          return
        }
        const current = port.getDriver()
        if (current.kind === 'mobile' && current.clientId === clientId) {
          const pendingClientId = Array.from(claim.pending.values()).at(-1)?.clientId
          port.setDriver(
            pendingClientId ? { kind: 'mobile', clientId: pendingClientId } : claim.base
          )
        }
        this.deleteIfSettled(ptyId, claim)
      }
    }
  }

  clearPty(ptyId: string): void {
    this.claims.delete(ptyId)
  }

  private deleteIfSettled(ptyId: string, claim: InputFloorClaim): void {
    if (claim.pending.size === 0 && this.claims.get(ptyId) === claim) {
      this.claims.delete(ptyId)
    }
  }
}
