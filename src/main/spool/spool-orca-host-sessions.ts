import { lstat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type {
  SpoolExecutionOperation,
  SpoolMutationResult,
  SpoolSessionReadResult
} from '../../shared/spool/spool-operation-contract'
import { parseExecutionHostId } from '../../shared/execution-host'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { readNativeChatTranscript } from '../native-chat/transcript-reader'
import {
  decodeClaudeTranscriptLine,
  decodeCodexTranscriptLine
} from '../native-chat/transcript-line-decoders'
import { decodeTranscriptStream } from '../native-chat/transcript-stream-lines'
import type { SpoolHostOperationContext } from './spool-execution-gateway'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolOwnerSessionRecords } from './spool-owner-session-records'
import type { SpoolContinuedSessionBindings } from './spool-continued-session-bindings'
import { projectSpoolSessionTranscript } from './spool-session-transcript-projection'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024

type SessionOperation = Extract<
  SpoolExecutionOperation,
  { kind: 'session.read' | 'session.continue' }
>

type SpoolSessionRuntime = Pick<OrcaRuntimeService, 'createTerminal'>

/** Resolves historical locator material only inside the owner execution process. */
export class OrcaSpoolHostSessions {
  constructor(
    private readonly runtime: SpoolSessionRuntime,
    private readonly records: SpoolOwnerSessionRecords,
    private readonly continued: SpoolContinuedSessionBindings
  ) {}

  async invoke(
    target: SpoolPublicWorktreeInstance,
    operation: SessionOperation,
    context: SpoolHostOperationContext
  ): Promise<SpoolSessionReadResult | SpoolMutationResult> {
    const record = this.records.resolve(operation.ownerRecordKey)
    if (
      !record ||
      record.executionHostId !== target.target.executionHostId ||
      record.worktreeInstanceId !== target.instanceId ||
      record.spoolIncarnationId !== target.spoolIncarnationId
    ) {
      throw new SpoolExecutionError('resource_not_found')
    }
    const host = parseExecutionHostId(record.executionHostId)
    if (!host || host.kind === 'runtime') {
      // Why: a paired runtime needs its own admission guard at the remote spawn point.
      throw new SpoolExecutionError('resource_unavailable')
    }
    if (operation.kind === 'session.read') {
      const messages =
        host.kind === 'ssh'
          ? await this.readSshTranscript(host.targetId, record.transcriptPath, record.provider)
          : await this.readLocalTranscript(
              record.transcriptPath,
              record.provider,
              record.providerSessionId
            )
      context.signal.throwIfAborted()
      return projectSpoolSessionTranscript(messages)
    }
    const guard = context.admissionGuard
    if (!guard) {
      throw new SpoolExecutionError('unauthorized')
    }
    context.signal.throwIfAborted()
    const created = await this.runtime.createTerminal(`id:${target.worktreeId}`, {
      command: record.resumeCommand,
      cwd: target.target.worktreePath,
      launchAgent: record.provider,
      viewMode: 'chat',
      presentation: 'background',
      beforeAgentTrust: async () => {
        context.signal.throwIfAborted()
        await guard.beforeSideEffect()
      },
      beforeSpawn: async () => {
        context.signal.throwIfAborted()
        await guard.beforeSideEffect()
      }
    })
    this.continued.remember(target, record, created.handle)
    return { ok: true }
  }

  private async readLocalTranscript(
    transcriptPath: string,
    provider: 'claude' | 'codex',
    providerSessionId: string
  ): Promise<NativeChatMessage[]> {
    const stats = await lstat(transcriptPath).catch(() => null)
    if (!stats || !stats.isFile()) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    if (stats.size > MAX_TRANSCRIPT_BYTES) {
      throw new SpoolExecutionError('result_too_large')
    }
    const result = await readNativeChatTranscript(provider, providerSessionId, {
      filePath: transcriptPath
    })
    if (!('messages' in result)) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    return result.messages
  }

  private async readSshTranscript(
    targetId: string,
    transcriptPath: string,
    provider: 'claude' | 'codex'
  ): Promise<NativeChatMessage[]> {
    const filesystem = getSshFilesystemProvider(targetId)
    if (!filesystem) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    const stats = await filesystem.stat(transcriptPath).catch(() => null)
    if (!stats || stats.type !== 'file') {
      throw new SpoolExecutionError('resource_unavailable')
    }
    if (stats.size > MAX_TRANSCRIPT_BYTES) {
      throw new SpoolExecutionError('result_too_large')
    }
    const read = await filesystem.readFile(transcriptPath)
    if (read.isBinary || Buffer.byteLength(read.content, 'utf8') > MAX_TRANSCRIPT_BYTES) {
      throw new SpoolExecutionError('result_too_large')
    }
    const decoded = await decodeTranscriptStream(
      Readable.from([read.content]),
      transcriptPath,
      0,
      provider === 'claude' ? decodeClaudeTranscriptLine : decodeCodexTranscriptLine,
      true
    )
    return decoded.messages
  }
}
