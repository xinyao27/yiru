import type {
  CoworkingExecutionOperation,
  CoworkingSubscriptionOperation
} from '../../shared/coworking/operation-contract'
import {
  CoworkingPairedRuntimeCanonicalizeParamsSchema,
  CoworkingPairedRuntimeInspectParamsSchema,
  CoworkingPairedRuntimeInvokeParamsSchema,
  CoworkingPairedRuntimeReleaseChannelParamsSchema,
  CoworkingPairedRuntimeRevokeWorktreeParamsSchema,
  CoworkingPairedRuntimeSubscribeParamsSchema,
  parseCoworkingPairedRuntimeOperation
} from '../../shared/coworking/paired-runtime-host-contract'
import {
  CoworkingPairedRuntimeCanonicalizeResultSchema,
  CoworkingPairedRuntimeInspectionSchema
} from '../../shared/coworking/paired-runtime-result-contract'
import {
  callRuntimeEnvironmentExistingRoute,
  subscribeRuntimeEnvironmentExistingRoute
} from '../runtime/environment-existing-route'
import type {
  CoworkingCanonicalHostPathResult,
  CoworkingPairedRuntimeWorktreeHostAdapter
} from './actual-host-path-resolver'
import { CoworkingExecutionError } from './execution-error'
import type {
  CoworkingHostAdapter,
  CoworkingHostOperationContext,
  CoworkingHostSubscription
} from './execution-gateway'
import { invokeAdmittedPairedRuntimeOperation } from './paired-runtime-admitted-invocation'
import { CoworkingPairedRuntimeChannelRegistry } from './paired-runtime-channel-registry'
import { invokePairedRuntimeSession } from './paired-runtime-session-invocation'
import {
  boundPairedRuntimeTargetSelector,
  pairedRuntimeEnvironmentId,
  pairedRuntimeTargetSelector
} from './paired-runtime-target-binding'
import { PairedRuntimeTerminalSubscription } from './paired-runtime-terminal-subscription'
import type { CoworkingOwnerHistoricalSessionRecord } from './session-source'
import type {
  CoworkingHostWorktreeInspection,
  CoworkingHostWorktreeInspectionMode,
  CoworkingOwnerWorktree
} from './worktree-incarnation'
import type { CoworkingPublicWorktreeInstance } from './worktree-publication-state'

const DEFAULT_TIMEOUT_MS = 15_000

export type YiruCoworkingPairedRuntimeHostAdapterOptions = {
  userDataPath: string
  timeoutMs?: number
  resolveOwnerHistoricalRecord?: (
    ownerRecordKey: string
  ) => CoworkingOwnerHistoricalSessionRecord | null
}

/** Forwards only the narrow internal Coworking host contract over an existing runtime pairing. */
export class YiruCoworkingPairedRuntimeHostAdapter
  implements CoworkingHostAdapter, CoworkingPairedRuntimeWorktreeHostAdapter
{
  private readonly registry = new CoworkingPairedRuntimeChannelRegistry()

  constructor(private readonly options: YiruCoworkingPairedRuntimeHostAdapterOptions) {}

  async inspectWorktree(
    target: CoworkingOwnerWorktree,
    mode: CoworkingHostWorktreeInspectionMode
  ): Promise<CoworkingHostWorktreeInspection> {
    const environmentId = pairedRuntimeEnvironmentId(target)
    const params = CoworkingPairedRuntimeInspectParamsSchema.parse({
      target: pairedRuntimeTargetSelector(target),
      mode
    })
    try {
      const response = await this.call(environmentId, 'coworking.host.inspectWorktree', params)
      if (!response.ok) {
        return { status: 'unavailable', reason: 'host-unavailable' }
      }
      const result = CoworkingPairedRuntimeInspectionSchema.safeParse(response.result)
      return result.success
        ? result.data
        : { status: 'unavailable', reason: 'invalid-host-response' }
    } catch {
      return { status: 'unavailable', reason: 'host-unavailable' }
    }
  }

  async canonicalizePath(args: {
    target: CoworkingOwnerWorktree
    path: string
  }): Promise<CoworkingCanonicalHostPathResult> {
    const environmentId = pairedRuntimeEnvironmentId(args.target)
    const params = CoworkingPairedRuntimeCanonicalizeParamsSchema.parse({
      target: pairedRuntimeTargetSelector(args.target),
      path: args.path
    })
    try {
      const response = await this.call(environmentId, 'coworking.host.canonicalizePath', params)
      if (!response.ok) {
        return { status: 'unavailable' }
      }
      const result = CoworkingPairedRuntimeCanonicalizeResultSchema.safeParse(response.result)
      return result.success ? result.data : { status: 'invalid' }
    } catch {
      return { status: 'unavailable' }
    }
  }

  async invoke(
    target: CoworkingPublicWorktreeInstance,
    operationInput: CoworkingExecutionOperation,
    context: CoworkingHostOperationContext
  ): Promise<unknown> {
    const environmentId = pairedRuntimeEnvironmentId(target.ownerWorktree)
    const operation = parseCoworkingPairedRuntimeOperation(operationInput)
    if (
      target.ownerWorktree.kind === 'folder' &&
      (operation.kind === 'files.diff' ||
        operation.kind.startsWith('git.') ||
        operation.kind === 'checks.read')
    ) {
      // Why: outer policy must hold even if paired-runtime repository metadata has drifted.
      throw new CoworkingExecutionError('method_not_found')
    }
    const channel = this.registry.channel(context.connectionId, environmentId)
    channel.instanceIds.add(target.instanceId)
    if (operation.kind === 'session.continue') {
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
    const params = CoworkingPairedRuntimeInvokeParamsSchema.parse({
      target: boundPairedRuntimeTargetSelector(target),
      channelRef: channel.channelRef,
      operation
    })
    return await invokeAdmittedPairedRuntimeOperation({
      operation,
      context,
      send: (beforeSend) =>
        this.call(environmentId, 'coworking.host.invoke', params, {
          beforeSend,
          signal: context.signal
        })
    })
  }

  subscribe(
    target: CoworkingPublicWorktreeInstance,
    operation: CoworkingSubscriptionOperation,
    context: CoworkingHostOperationContext,
    emit: (event: unknown) => void
  ): CoworkingHostSubscription {
    const environmentId = pairedRuntimeEnvironmentId(target.ownerWorktree)
    const channel = this.registry.channel(context.connectionId, environmentId)
    channel.instanceIds.add(target.instanceId)
    const params = CoworkingPairedRuntimeSubscribeParamsSchema.parse({
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
      'coworking.host.subscribeTerminal',
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
      const params = CoworkingPairedRuntimeRevokeWorktreeParamsSchema.parse({
        instanceId,
        channelRef: channel.channelRef
      })
      void this.call(environmentId, 'coworking.host.revokeWorktree', params).catch(() => undefined)
    }
  }

  private call(
    environmentId: string,
    method: string,
    params: unknown,
    options: { beforeSend?: () => void | Promise<void>; signal?: AbortSignal } = {}
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
    const params = CoworkingPairedRuntimeReleaseChannelParamsSchema.parse({ channelRef })
    void this.call(environmentId, 'coworking.host.releaseChannel', params).catch(() => undefined)
  }
}
