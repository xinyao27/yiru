import type {
  SpoolExecutionOperation,
  SpoolSessionContinueHostResult
} from '../../shared/spool/spool-operation-contract'
import { parseExecutionHostId } from '../../shared/execution-host'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import type { SpoolHostOperationContext } from './spool-execution-gateway'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolOwnerSessionRecords } from './spool-owner-session-records'
import type { SpoolTerminalSessionBindings } from './spool-terminal-session-bindings'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

type SessionOperation = Extract<SpoolExecutionOperation, { kind: 'session.continue' }>

type SpoolSessionRuntime = Pick<YiruRuntimeService, 'createTerminal'>

/** Resolves historical locator material only inside the owner execution process. */
export class YiruSpoolHostSessions {
  constructor(
    private readonly runtime: SpoolSessionRuntime,
    private readonly records: SpoolOwnerSessionRecords,
    private readonly sessionBindings: SpoolTerminalSessionBindings
  ) {}

  async invoke(
    target: SpoolPublicWorktreeInstance,
    operation: SessionOperation,
    context: SpoolHostOperationContext
  ): Promise<SpoolSessionContinueHostResult> {
    const record = this.records.resolve(operation.ownerRecordKey)
    if (
      !record ||
      record.executionHostId !== target.ownerWorktree.executionHostId ||
      record.actualHostScope !== target.actualHostScope ||
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
    const guard = context.admissionGuard
    if (!guard) {
      throw new SpoolExecutionError('unauthorized')
    }
    context.signal.throwIfAborted()
    let spawnAdmitted = false
    let created: Awaited<ReturnType<SpoolSessionRuntime['createTerminal']>>
    try {
      created = await this.runtime.createTerminal(`id:${target.worktreeId}`, {
        command: record.resumeCommand,
        cwd: target.ownerWorktree.worktreePath,
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
          spawnAdmitted = true
        }
      })
    } catch (error) {
      if (spawnAdmitted) {
        // Why: after the final spawn guard, a host error cannot prove no agent was created.
        throw new SpoolExecutionError('outcome_unknown')
      }
      throw error
    }
    const terminalHandle = requireContinuedTerminalHandle(
      created.handle,
      created.worktreeId,
      target.worktreeId
    )
    this.sessionBindings.rememberContinued(target, record, terminalHandle)
    return { terminalHandle }
  }
}

function requireContinuedTerminalHandle(
  handle: string,
  worktreeId: string,
  expectedWorktreeId: string
): string {
  if (
    !handle ||
    handle.length > 2_048 ||
    handle.includes('\0') ||
    worktreeId !== expectedWorktreeId
  ) {
    // Why: a malformed post-spawn response cannot prove whether the new agent is running.
    throw new SpoolExecutionError('outcome_unknown')
  }
  return handle
}
