import { RuntimeTerminalDeliverPendingMessages } from '../terminal/deliver-pending-messages'

export abstract class RuntimeWorkbenchAvailability extends RuntimeTerminalDeliverPendingMessages {
  protected hasAvailableWorkbench(): boolean {
    const graph = this.terminalSessions.getGraphState()
    return this.shellConnectionId !== null && graph.authoritativeWindowId !== null
  }
}
