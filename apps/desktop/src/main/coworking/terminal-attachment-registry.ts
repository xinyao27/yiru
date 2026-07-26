import type {
  CoworkingResolvedHistoricalSession,
  CoworkingResolvedLiveSession
} from './session/catalog'
import type { CoworkingPublicWorktreeInstance } from './worktree-publication-state'

const MAX_TERMINAL_ATTACHMENTS_PER_CONNECTION = 2_000

export type CoworkingTerminalAttachment = Readonly<{
  worktree: CoworkingPublicWorktreeInstance
  session: CoworkingResolvedLiveSession
}>

/** Keeps resumed and newly created PTY handles behind connection-scoped catalog references. */
export class CoworkingTerminalAttachmentRegistry {
  private readonly attachmentsByConnection = new Map<
    string,
    Map<string, CoworkingTerminalAttachment>
  >()

  remember(
    connectionId: string,
    sessionRef: string,
    worktree: CoworkingPublicWorktreeInstance,
    historical: CoworkingResolvedHistoricalSession,
    terminalHandle: string
  ): void {
    this.rememberLive(connectionId, sessionRef, worktree, {
      kind: 'live',
      sessionKey: historical.sessionKey,
      terminalHandle,
      executionHostId: historical.executionHostId,
      actualHostScope: historical.actualHostScope,
      worktreeInstanceId: historical.worktreeInstanceId,
      coworkingIncarnationId: historical.coworkingIncarnationId,
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
    worktree: CoworkingPublicWorktreeInstance,
    session: CoworkingResolvedLiveSession
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

  resolve(connectionId: string, sessionRef: string): CoworkingTerminalAttachment | null {
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
