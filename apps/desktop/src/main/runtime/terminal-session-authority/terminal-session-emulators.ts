export class TerminalSessionEmulators<TState> {
  private readonly states = new Map<string, TState>()
  // Why: hydration is one-shot so a late renderer seed cannot overwrite live PTY bytes.
  private readonly hydration = new Map<string, 'pending' | 'done'>()

  get(ptyId: string): TState | null {
    return this.states.get(ptyId) ?? null
  }

  has(ptyId: string): boolean {
    return this.states.has(ptyId)
  }

  set(ptyId: string, state: TState): void {
    this.states.set(ptyId, state)
  }

  list(): TState[] {
    return [...this.states.values()]
  }

  getHydration(ptyId: string): 'pending' | 'done' | null {
    return this.hydration.get(ptyId) ?? null
  }

  setHydration(ptyId: string, state: 'pending' | 'done'): void {
    this.hydration.set(ptyId, state)
  }

  take(ptyId: string): TState | null {
    this.hydration.delete(ptyId)
    const state = this.states.get(ptyId) ?? null
    this.states.delete(ptyId)
    return state
  }
}
