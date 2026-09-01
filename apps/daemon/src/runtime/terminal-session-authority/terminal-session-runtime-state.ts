import { TerminalSessionEmulators } from './terminal-session-emulators'
import type {
  TerminalSessionGraphPort,
  TerminalSessionHandleRecord,
  TerminalSessionLeaf,
  TerminalSessionTab
} from './terminal-session-graph'
import { TerminalSessionGraphAuthority } from './terminal-session-graph-authority'
import type { TerminalSessionPtyRecord } from './terminal-session-record-registry'
import { TerminalSessionWaiters } from './terminal-session-waiters'

export class TerminalSessionRuntimeState<
  TTab extends TerminalSessionTab,
  TLeaf extends TerminalSessionLeaf,
  TPty extends TerminalSessionPtyRecord,
  THandle extends TerminalSessionHandleRecord,
  TEmulator,
  TTerminalWaiter extends { handle: string },
  TMessageWaiter extends { handle: string }
> extends TerminalSessionGraphAuthority<TTab, TLeaf, TPty, THandle> {
  private readonly emulators = new TerminalSessionEmulators<TEmulator>()
  private readonly waiters = new TerminalSessionWaiters<TTerminalWaiter, TMessageWaiter>()

  constructor(port: TerminalSessionGraphPort) {
    super(port)
  }

  getEmulator(ptyId: string): TEmulator | null {
    return this.emulators.get(ptyId)
  }

  hasEmulator(ptyId: string): boolean {
    return this.emulators.has(ptyId)
  }

  setEmulator(ptyId: string, state: TEmulator): void {
    this.emulators.set(ptyId, state)
  }

  listEmulators(): TEmulator[] {
    return this.emulators.list()
  }

  getEmulatorHydration(ptyId: string): 'pending' | 'done' | null {
    return this.emulators.getHydration(ptyId)
  }

  setEmulatorHydration(ptyId: string, state: 'pending' | 'done'): void {
    this.emulators.setHydration(ptyId, state)
  }

  takeEmulator(ptyId: string): TEmulator | null {
    return this.emulators.take(ptyId)
  }

  addTerminalWaiter(waiter: TTerminalWaiter): void {
    this.waiters.addTerminal(waiter)
  }

  listTerminalWaiters(handle: string): TTerminalWaiter[] {
    return this.waiters.listTerminal(handle)
  }

  removeTerminalWaiter(waiter: TTerminalWaiter): void {
    this.waiters.removeTerminal(waiter)
  }

  listTerminalWaiterHandles(): string[] {
    return this.waiters.listTerminalHandles()
  }

  addMessageWaiter(waiter: TMessageWaiter): void {
    this.waiters.addMessage(waiter)
  }

  listMessageWaiters(handle: string): TMessageWaiter[] {
    return this.waiters.listMessages(handle)
  }

  removeMessageWaiter(waiter: TMessageWaiter): void {
    this.waiters.removeMessage(waiter)
  }
}
