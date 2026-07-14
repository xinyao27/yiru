import {
  SpoolPairedRuntimeCanonicalizeParamsSchema,
  SpoolPairedRuntimeInspectParamsSchema,
  SpoolPairedRuntimeInvokeParamsSchema,
  SpoolPairedRuntimeReleaseChannelParamsSchema,
  SpoolPairedRuntimeRevokeWorktreeParamsSchema,
  SpoolPairedRuntimeSubscribeParamsSchema,
  parseSpoolPairedRuntimeOperation
} from '../../shared/spool/spool-paired-runtime-host-contract'
import {
  SpoolPairedRuntimeCanonicalizeResultSchema,
  SpoolPairedRuntimeInspectionSchema,
  SpoolPairedRuntimeInvokeResponseSchema,
  parseSpoolPairedRuntimeResult
} from '../../shared/spool/spool-paired-runtime-result-contract'
import {
  isSpoolMutationOperation,
  type SpoolExecutionOperation,
  type SpoolSubscriptionOperation
} from '../../shared/spool/spool-operation-contract'
import {
  callRuntimeEnvironmentExistingRoute,
  subscribeRuntimeEnvironmentExistingRoute
} from '../ipc/runtime-environment-existing-route'
import type {
  SpoolCanonicalHostPathResult,
  SpoolPairedRuntimeWorktreeHostAdapter
} from './spool-actual-host-path-resolver'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolHostAdapter,
  SpoolHostOperationContext,
  SpoolHostSubscription
} from './spool-execution-gateway'
import type {
  SpoolHostWorktreeInspection,
  SpoolHostWorktreeInspectionMode,
  SpoolOwnerWorktree
} from './spool-worktree-incarnation'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import { PairedRuntimeTerminalSubscription } from './spool-paired-runtime-terminal-subscription'
import { SpoolPairedRuntimeChannelRegistry } from './spool-paired-runtime-channel-registry'
import { invokePairedRuntimeSession } from './spool-paired-runtime-session-invocation'
import {
  boundPairedRuntimeTargetSelector,
  pairedRuntimeEnvironmentId,
  pairedRuntimeTargetSelector
} from './spool-paired-runtime-target-binding'
import type { SpoolOwnerHistoricalSessionRecord } from './spool-session-source'

const DEFAULT_TIMEOUT_MS = 15_000

export type OrcaSpoolPairedRuntimeHostAdapterOptions = {
  userDataPath: string
  timeoutMs?: number
  resolveOwnerHistoricalRecord?: (
    ownerRecordKey: string
  ) => SpoolOwnerHistoricalSessionRecord | null
}

/** Forwards only the narrow internal Spool host contract over an existing runtime pairing. */
export class OrcaSpoolPairedRuntimeHostAdapter
  implements SpoolHostAdapter, SpoolPairedRuntimeWorktreeHostAdapter
{
  private readonly registry = new SpoolPairedRuntimeChannelRegistry()

  constructor(private readonly options: OrcaSpoolPairedRuntimeHostAdapterOptions) {}

  async inspectWorktree(
    target: SpoolOwnerWorktree,
    mode: SpoolHostWorktreeInspectionMode
  ): Promise<SpoolHostWorktreeInspection> {
    const environmentId = pairedRuntimeEnvironmentId(target)
    const params = SpoolPairedRuntimeInspectParamsSchema.parse({
      target: pairedRuntimeTargetSelector(target),
      mode
    })
    try {
      const response = await this.call(environmentId, 'spool.host.inspectWorktree', params)
      if (!response.ok) {
        return { status: 'unavailable', reason: 'host-unavailable' }
      }
      const result = SpoolPairedRuntimeInspectionSchema.safeParse(response.result)
      return result.success
        ? result.data
        : { status: 'unavailable', reason: 'invalid-host-response' }
    } catch {
      return { status: 'unavailable', reason: 'host-unavailable' }
    }
  }

  async canonicalizePath(args: {
    target: SpoolOwnerWorktree
    path: string
  }): Promise<SpoolCanonicalHostPathResult> {
    const environmentId = pairedRuntimeEnvironmentId(args.target)
    const params = SpoolPairedRuntimeCanonicalizeParamsSchema.parse({
      target: pairedRuntimeTargetSelector(args.target),
      path: args.path
    })
    try {
      const response = await this.call(environmentId, 'spool.host.canonicalizePath', params)
      if (!response.ok) {
        return { status: 'unavailable' }
      }
      const result = SpoolPairedRuntimeCanonicalizeResultSchema.safeParse(response.result)
      return result.success ? result.data : { status: 'unavailable' }
    } catch {
      return { status: 'unavailable' }
    }
  }

  async invoke(
    target: SpoolPublicWorktreeInstance,
    operationInput: SpoolExecutionOperation,
    context: SpoolHostOperationContext
  ): Promise<unknown> {
    const environmentId = pairedRuntimeEnvironmentId(target.target)
    const operation = parseSpoolPairedRuntimeOperation(operationInput)
    const channel = this.registry.channel(context.connectionId, environmentId)
    channel.instanceIds.add(target.instanceId)
    if (operation.kind === 'session.read' || operation.kind === 'session.continue') {
      return await invokePairedRuntimeSession({
        userDataPath: this.options.userDataPath,
        timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        environmentId,
        channelRef: channel.channelRef,
        target,
        operation,
        context,
        resolveOwnerHistoricalRecord: this.options.resolveOwnerHistoricalRecord
      })
    }
    const params = SpoolPairedRuntimeInvokeParamsSchema.parse({
      target: boundPairedRuntimeTargetSelector(target),
      channelRef: channel.channelRef,
      operation
    })
    let admitted = false
    try {
      const response = await this.call(environmentId, 'spool.host.invoke', params, {
        beforeSend: async () => {
          if (context.signal.aborted) {
            throw new SpoolExecutionError('resource_not_found')
          }
          if (isSpoolMutationOperation(operation)) {
            if (!context.admissionGuard) {
              throw new SpoolExecutionError('unauthorized')
            }
            await context.admissionGuard.beforeSideEffect()
            admitted = true
          }
        }
      })
      context.signal.throwIfAborted()
      if (!response.ok) {
        // Why: old runtimes and broad RPC failures never trigger a less-restricted fallback.
        throw new SpoolExecutionError('resource_unavailable')
      }
      const envelope = SpoolPairedRuntimeInvokeResponseSchema.safeParse(response.result)
      if (!envelope.success) {
        throw new SpoolExecutionError(
          isSpoolMutationOperation(operation) && admitted
            ? 'outcome_unknown'
            : 'resource_unavailable'
        )
      }
      if (envelope.data.status === 'error') {
        throw new SpoolExecutionError(envelope.data.code)
      }
      return parseSpoolPairedRuntimeResult(operation, envelope.data.result)
    } catch (error) {
      if (error instanceof SpoolExecutionError) {
        throw error
      }
      throw new SpoolExecutionError(
        isSpoolMutationOperation(operation) && admitted ? 'outcome_unknown' : 'resource_unavailable'
      )
    }
  }

  subscribe(
    target: SpoolPublicWorktreeInstance,
    operation: SpoolSubscriptionOperation,
    context: SpoolHostOperationContext,
    emit: (event: unknown) => void
  ): SpoolHostSubscription {
    const environmentId = pairedRuntimeEnvironmentId(target.target)
    const channel = this.registry.channel(context.connectionId, environmentId)
    channel.instanceIds.add(target.instanceId)
    const params = SpoolPairedRuntimeSubscribeParamsSchema.parse({
      target: boundPairedRuntimeTargetSelector(target),
      channelRef: channel.channelRef,
      operation
    })
    const subscription = new PairedRuntimeTerminalSubscription({
      instanceId: target.instanceId,
      emit,
      signal: context.signal,
      onClosed: () => this.registry.forgetSubscription(context.connectionId, subscription)
    })
    this.registry.rememberSubscription(context.connectionId, subscription)
    void subscribeRuntimeEnvironmentExistingRoute(
      this.options.userDataPath,
      environmentId,
      'spool.host.subscribeTerminal',
      params,
      {
        onEvent: (event) => subscription.handleEvent(event),
        onClose: () => subscription.handleTransportClose()
      }
    )
      .then((downstream) => subscription.attach(downstream))
      .catch(() => subscription.handleTransportClose())
    return subscription
  }

  closeConnection(connectionId: string): void {
    for (const subscription of this.registry.takeSubscriptions(connectionId)) {
      subscription.close()
    }
    for (const [environmentId, channel] of this.registry.takeChannels(connectionId)) {
      this.releaseChannel(environmentId, channel.channelRef)
    }
  }

  revokeWorktree(connectionId: string, instanceId: string): void {
    for (const subscription of this.registry.subscriptionsFor(connectionId)) {
      if (subscription.instanceId === instanceId) {
        subscription.close()
      }
    }
    for (const [environmentId, channel] of this.registry.channelsFor(connectionId)) {
      if (!channel.instanceIds.delete(instanceId)) {
        continue
      }
      const params = SpoolPairedRuntimeRevokeWorktreeParamsSchema.parse({
        instanceId,
        channelRef: channel.channelRef
      })
      void this.call(environmentId, 'spool.host.revokeWorktree', params).catch(() => undefined)
    }
  }

  private call(
    environmentId: string,
    method: string,
    params: unknown,
    options: { beforeSend?: () => void | Promise<void> } = {}
  ) {
    return callRuntimeEnvironmentExistingRoute(
      this.options.userDataPath,
      environmentId,
      method,
      params,
      this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      options
    )
  }

  private releaseChannel(environmentId: string, channelRef: string): void {
    const params = SpoolPairedRuntimeReleaseChannelParamsSchema.parse({ channelRef })
    void this.call(environmentId, 'spool.host.releaseChannel', params).catch(() => undefined)
  }
}
