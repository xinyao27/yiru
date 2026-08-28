type HandleWaiter = { handle: string }

export class TerminalSessionWaiters<
  TTerminalWaiter extends HandleWaiter,
  TMessageWaiter extends HandleWaiter
> {
  private readonly terminal = new Map<string, Set<TTerminalWaiter>>()
  private readonly messages = new Map<string, Set<TMessageWaiter>>()

  addTerminal(waiter: TTerminalWaiter): void {
    this.add(this.terminal, waiter)
  }

  listTerminal(handle: string): TTerminalWaiter[] {
    return [...(this.terminal.get(handle) ?? [])]
  }

  removeTerminal(waiter: TTerminalWaiter): void {
    this.remove(this.terminal, waiter)
  }

  listTerminalHandles(): string[] {
    return [...this.terminal.keys()]
  }

  addMessage(waiter: TMessageWaiter): void {
    this.add(this.messages, waiter)
  }

  listMessages(handle: string): TMessageWaiter[] {
    return [...(this.messages.get(handle) ?? [])]
  }

  removeMessage(waiter: TMessageWaiter): void {
    this.remove(this.messages, waiter)
  }

  private add<T extends HandleWaiter>(map: Map<string, Set<T>>, waiter: T): void {
    let waiters = map.get(waiter.handle)
    if (!waiters) {
      waiters = new Set()
      map.set(waiter.handle, waiters)
    }
    waiters.add(waiter)
  }

  private remove<T extends HandleWaiter>(map: Map<string, Set<T>>, waiter: T): void {
    const waiters = map.get(waiter.handle)
    if (!waiters) {
      return
    }
    waiters.delete(waiter)
    if (waiters.size === 0) {
      map.delete(waiter.handle)
    }
  }
}
