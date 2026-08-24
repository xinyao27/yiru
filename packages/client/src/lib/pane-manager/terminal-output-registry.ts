import type {
  QueueEntry,
  TerminalBacklogRecoveryRequest,
  TerminalOutputTarget
} from './terminal-output-model'

const queuedByTerminal = new Map<TerminalOutputTarget, QueueEntry>()
const backlogRecoveryByTerminal = new WeakMap<
  TerminalOutputTarget,
  TerminalBacklogRecoveryRequest
>()

export function getTerminalOutputEntry(terminal: TerminalOutputTarget): QueueEntry | undefined {
  return queuedByTerminal.get(terminal)
}

export function hasTerminalOutputEntry(terminal: TerminalOutputTarget): boolean {
  return queuedByTerminal.has(terminal)
}

export function setTerminalOutputEntry(entry: QueueEntry): void {
  queuedByTerminal.set(entry.terminal, entry)
}

export function deleteTerminalOutputEntry(terminal: TerminalOutputTarget): boolean {
  return queuedByTerminal.delete(terminal)
}

export function terminalOutputEntryCount(): number {
  return queuedByTerminal.size
}

export function terminalOutputEntries(): IterableIterator<QueueEntry> {
  return queuedByTerminal.values()
}

export function requestRegisteredTerminalBacklogRecovery(terminal: TerminalOutputTarget): boolean {
  return backlogRecoveryByTerminal.get(terminal)?.() ?? false
}

export function registerTerminalBacklogRecoveryRequest(
  terminal: TerminalOutputTarget,
  requestRecovery: TerminalBacklogRecoveryRequest
): () => void {
  backlogRecoveryByTerminal.set(terminal, requestRecovery)
  return () => {
    if (backlogRecoveryByTerminal.get(terminal) === requestRecovery) {
      backlogRecoveryByTerminal.delete(terminal)
    }
  }
}
