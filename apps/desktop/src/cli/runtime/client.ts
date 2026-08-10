import { randomUUID } from 'node:crypto'

import {
  ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY,
  ORCHESTRATION_CONTRACT_VERSION
} from '@yiru/runtime-protocol/capabilities'
import type { RuntimeOrchestrationEnvelope } from '@yiru/runtime-protocol/rpc-envelope'
import {
  isOrchestrationMutation,
  orchestrationMigrationData
} from '~shared/orchestration-rpc-contract'
import type { CliStatusResult } from '~shared/runtime-types'

import {
  attachMutationRecovery,
  delay,
  isOpenYiruReady,
  throwDesktopActivationBlocked
} from './client-lifecycle'
import { launchYiruApp } from './launch'
import { getDefaultUserDataPath, readMetadata } from './metadata'
import { createRuntimeOrpcClient, runtimeContractValue } from './orpc-client-facade'
import type {
  RuntimeOrpcClient,
  RuntimeOrpcClientContext,
  RuntimeOrpcProcedure,
  RuntimeOrpcResponseMetadata
} from './orpc-client-types'
import { getCliStatus } from './status'
import { sendOrpcRequest } from './transport'
import { RuntimeClientError, type RuntimeRpcSuccess } from './types'

const LONG_POLL_CLIENT_GRACE_MS = 10_000

export type RuntimeClientCallOptions = RuntimeOrchestrationEnvelope & {
  timeoutMs?: number
  signal?: AbortSignal
}

export class RuntimeClient {
  readonly rpc: RuntimeOrpcClient

  private readonly userDataPath: string
  private readonly requestTimeoutMs: number
  private orchestrationContractCheck: Promise<void> | null = null

  // Why: browser commands trigger first-time session init (agent-browser connect +
  // CDP proxy setup) which can take 15-30s. 60s accommodates cold start without
  // being so large that genuine hangs go unnoticed.
  constructor(userDataPath = getDefaultUserDataPath(), requestTimeoutMs = 60_000) {
    this.userDataPath = userDataPath
    this.requestTimeoutMs = requestTimeoutMs
    this.rpc = createRuntimeOrpcClient({
      call: (path, input, options) => this.invoke(path, input, options)
    })
  }

  async call<TInput, TOutput>(
    procedure: RuntimeOrpcProcedure<TInput, TOutput>,
    input: TInput,
    options: RuntimeClientCallOptions = {}
  ): Promise<RuntimeRpcSuccess<TOutput>> {
    let responseMetadata: RuntimeOrpcResponseMetadata | undefined
    const { signal, ...contextOptions } = options
    const result = await procedure(input, {
      signal,
      context: {
        ...contextOptions,
        onResponse: (metadata) => {
          responseMetadata = metadata
        }
      }
    })
    if (!responseMetadata) {
      throw new RuntimeClientError(
        'invalid_runtime_response',
        'The Yiru runtime returned no response metadata.'
      )
    }
    return {
      id: responseMetadata.requestId,
      ok: true,
      result,
      _meta: { runtimeId: responseMetadata.runtimeId }
    }
  }

  async getCliStatus(): Promise<RuntimeRpcSuccess<CliStatusResult>> {
    return getCliStatus(this.userDataPath)
  }

  async openYiru(timeoutMs = 15_000): Promise<RuntimeRpcSuccess<CliStatusResult>> {
    const initial = await this.getCliStatus()
    if (initial.result.app.desktopWindowStatus === 'blocked') {
      throwDesktopActivationBlocked()
    }
    launchYiruApp()
    if (isOpenYiruReady(initial)) {
      return initial
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const status = await this.getCliStatus()
      if (status.result.app.desktopWindowStatus === 'blocked') {
        throwDesktopActivationBlocked()
      }
      if (isOpenYiruReady(status)) {
        return status
      }
      await delay(250)
    }

    throw new RuntimeClientError(
      'runtime_open_timeout',
      'Timed out waiting for a ready Yiru desktop window. The runtime may still be running headlessly.'
    )
  }

  private async invoke(
    path: readonly string[],
    input: unknown,
    options: { signal?: AbortSignal; context: RuntimeOrpcClientContext }
  ): Promise<unknown> {
    const method = runtimeMethodForPath(path)
    const timeoutMs = options.context.timeoutMs ?? this.resolveMethodTimeoutMs(method, input)
    const orchestrationMutation = isOrchestrationMutation(method, input)
    if (orchestrationMutation) {
      await this.ensureOrchestrationContractCompatible(timeoutMs)
    }
    const orchestrationRequestId = orchestrationMutation
      ? (options.context.orchestrationRequestId ?? randomUUID())
      : undefined
    const envelope: RuntimeOrchestrationEnvelope = {
      orchestrationCapability: options.context.orchestrationCapability,
      orchestrationContractVersion: method.startsWith('orchestration.')
        ? ORCHESTRATION_CONTRACT_VERSION
        : undefined,
      orchestrationRequestId
    }
    try {
      const metadata = readMetadata(this.userDataPath)
      const response = await sendOrpcRequest(
        metadata,
        path,
        input,
        timeoutMs,
        envelope,
        options.signal
      )
      options.context.onResponse?.({
        requestId: response.requestId,
        runtimeId: response.runtimeId
      })
      return response.result
    } catch (error) {
      throw attachMutationRecovery(error, orchestrationRequestId)
    }
  }

  private resolveMethodTimeoutMs(method: string, input: unknown): number {
    if ((method === 'orchestration.check' && isWaitingCheck(input)) || method === 'terminal.wait') {
      const inner = Number(getTimeoutMsParam(input))
      if (Number.isFinite(inner) && inner > 0) {
        return Math.max(inner + LONG_POLL_CLIENT_GRACE_MS, this.requestTimeoutMs)
      }
    }
    return this.requestTimeoutMs
  }

  private async ensureOrchestrationContractCompatible(timeoutMs: number): Promise<void> {
    if (!this.orchestrationContractCheck) {
      this.orchestrationContractCheck = this.checkOrchestrationContractCompatibility(timeoutMs)
    }
    await this.orchestrationContractCheck
  }

  private async checkOrchestrationContractCompatibility(timeoutMs: number): Promise<void> {
    const response = await this.call(this.rpc.status.get, undefined, { timeoutMs })
    if (!response.result.capabilities?.includes(ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY)) {
      throw new RuntimeClientError(
        'orchestration_migration_required',
        'The connected Yiru runtime does not support the current orchestration contract. No effects were applied.',
        orchestrationMigrationData('runtime_capability_missing')
      )
    }
  }
}

function runtimeMethodForPath(path: readonly string[]): string {
  let node: unknown = runtimeContractValue
  for (const segment of path) {
    if (!isRecord(node) || !(segment in node)) {
      return path.join('.')
    }
    node = node[segment]
  }
  if (isRecord(node) && isRecord(node['~orpc']) && isRecord(node['~orpc'].meta)) {
    const legacyMethod = node['~orpc'].meta.legacyMethod
    if (typeof legacyMethod === 'string' && legacyMethod.length > 0) {
      return legacyMethod
    }
  }
  return path.join('.')
}

function isWaitingCheck(input: unknown): boolean {
  return isRecord(input) && input.wait === true
}

function getTimeoutMsParam(input: unknown): unknown {
  return isRecord(input) ? input.timeoutMs : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
