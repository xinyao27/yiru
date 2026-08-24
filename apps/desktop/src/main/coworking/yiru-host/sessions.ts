import { parseExecutionHostId } from '@yiru/workbench-model/workspace'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'
import type {
  CoworkingExecutionOperation,
  CoworkingSessionContinueHostResult
} from '~shared/coworking/operation-contract'

import { CoworkingExecutionError } from '../execution-error'
import type { CoworkingHostOperationContext } from '../execution-gateway'
import type { CoworkingOwnerSessionRecords } from '../owner/session-records'
import type { CoworkingTerminalSessionBindings } from '../terminal-session-bindings'
import type { CoworkingPublicWorktreeInstance } from '../worktree-publication-state'

type SessionOperation = Extract<CoworkingExecutionOperation, { kind: 'session.continue' }>

type CoworkingSessionRuntime = Pick<YiruRuntimeService, 'createTerminal'>

/** Resolves historical locator material only inside the owner execution process. */
export class YiruCoworkingHostSessions {
  constructor(
    private readonly runtime: CoworkingSessionRuntime,
    private readonly records: CoworkingOwnerSessionRecords,
    private readonly sessionBindings: CoworkingTerminalSessionBindings
  ) {}

  async invoke(
    target: CoworkingPublicWorktreeInstance,
    operation: SessionOperation,
    context: CoworkingHostOperationContext
  ): Promise<CoworkingSessionContinueHostResult> {
    const record = this.records.resolve(operation.ownerRecordKey)
    if (
      !record ||
      record.executionHostId !== target.ownerWorktree.executionHostId ||
      record.actualHostScope !== target.actualHostScope ||
      record.worktreeInstanceId !== target.instanceId ||
      record.coworkingIncarnationId !== target.coworkingIncarnationId
    ) {
      throw new CoworkingExecutionError('resource_not_found')
    }
    const host = parseExecutionHostId(record.executionHostId)
    if (!host || host.kind === 'runtime') {
      // Why: a paired runtime needs its own admission guard at the remote spawn point.
      throw new CoworkingExecutionError('resource_unavailable')
    }
    const guard = context.admissionGuard
    if (!guard) {
      throw new CoworkingExecutionError('unauthorized')
    }
    context.signal.throwIfAborted()
    let spawnAdmitted = false
    let created: Awaited<ReturnType<CoworkingSessionRuntime['createTerminal']>>
    try {
      created = await this.runtime.createTerminal(`id:${target.worktreeId}`, {
        command: record.resumeCommand,
        cwd: target.ownerWorktree.worktreePath,
        launchAgent: record.provider,
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
        throw new CoworkingExecutionError('outcome_unknown')
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
    throw new CoworkingExecutionError('outcome_unknown')
  }
  return handle
}
