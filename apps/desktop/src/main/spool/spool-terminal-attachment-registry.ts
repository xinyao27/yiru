import type {
  SpoolResolvedHistoricalSession,
  SpoolResolvedLiveSession
} from './spool-session-catalog'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

const MAX_TERMINAL_ATTACHMENTS_PER_CONNECTION = 2_000

export type SpoolTerminalAttachment = Readonly<{
  worktree: SpoolPublicWorktreeInstance
  session: SpoolResolvedLiveSession
}>

/** Keeps resumed and newly created PTY handles behind connection-scoped catalog references. */
export class SpoolTerminalAttachmentRegistry {
  private readonly attachmentsByConnection = new Map<string, Map<string, SpoolTerminalAttachment>>()

  remember(
    connectionId: string,
    sessionRef: string,
    worktree: SpoolPublicWorktreeInstance,
    historical: SpoolResolvedHistoricalSession,
    terminalHandle: string
  ): void {
    this.rememberLive(connectionId, sessionRef, worktree, {
      kind: 'live',
      sessionKey: historical.sessionKey,
      terminalHandle,
      executionHostId: historical.executionHostId,
      actualHostScope: historical.actualHostScope,
      worktreeInstanceId: historical.worktreeInstanceId,
      spoolIncarnationId: historical.spoolIncarnationId,
      provider: historical.provider,
      providerSessionId: historical.providerSessionId,
      sessionKind: 'agent',
      agent: historical.provider,
      title: historical.title
    })
  }

  rememberLive(
    connectionId: string,
    sessionRef: string,
    worktree: SpoolPublicWorktreeInstance,
    session: SpoolResolvedLiveSession
  ): void {
    const attachments = this.attachmentsByConnection.get(connectionId) ?? new Map()
    this.attachmentsByConnection.set(connectionId, attachments)
    attachments.delete(sessionRef)
    attachments.set(sessionRef, { worktree, session })
    while (attachments.size > MAX_TERMINAL_ATTACHMENTS_PER_CONNECTION) {
      // Why: catalog discovery becomes the durable lookup after the handoff; this
      // connection-local bridge must stay bounded even under repeated resumes.
      const oldest = attachments.keys().next().value
      if (!oldest) {
        break
      }
      attachments.delete(oldest)
    }
  }

  resolve(connectionId: string, sessionRef: string): SpoolTerminalAttachment | null {
    const attachments = this.attachmentsByConnection.get(connectionId)
    const attachment = attachments?.get(sessionRef)
    if (!attachment || !attachments) {
      return null
    }
    attachments.delete(sessionRef)
    attachments.set(sessionRef, attachment)
    return attachment
  }

  forget(connectionId: string, sessionRef: string): void {
    const attachments = this.attachmentsByConnection.get(connectionId)
    attachments?.delete(sessionRef)
    if (attachments?.size === 0) {
      this.attachmentsByConnection.delete(connectionId)
    }
  }

  closeConnection(connectionId: string): void {
    this.attachmentsByConnection.delete(connectionId)
  }
}
