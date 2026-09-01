import {
  ORCHESTRATION_FEDERATION_READ_CONTRACT,
  ORCHESTRATION_FEDERATION_READ_OUTPUT_CONTRACT,
  type ORCHESTRATION_WORKER_READ_SOURCES,
  type OrchestrationWorkerReadInput
} from '@yiru/runtime-protocol/contract'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import {
  createWorkerOutputSourceIdentity,
  decodeWorkerOutputCursor,
  encodeWorkerOutputCursor
} from '~main/runtime/orchestration/worker-output-cursor'
import type { RpcContext } from '~main/runtime/rpc/core'

import { inspectWorkerTerminal, resolvePinnedFederatedServer } from './observation'
import { readExactWorkerOutput } from './output'

export async function handleOrchestrationWorkerRead(
  params: OrchestrationWorkerReadInput,
  { runtime }: RpcContext
) {
  const db = runtime.getOrchestrationDb()
  const federated = db.getFederatedDispatch(params.dispatch)
  if (federated) {
    const server = resolvePinnedFederatedServer(runtime, federated)
    try {
      const remote = await runtime.callOrchestrationWorkerServer(
        server.environmentId,
        ORCHESTRATION_FEDERATION_READ_OUTPUT_CONTRACT,
        {
          dispatchId: params.dispatch,
          cursor: params.cursor,
          limit: params.limit,
          source: params.source
        },
        15_000
      )
      return {
        ...remote.output,
        server: { environmentId: server.environmentId, name: server.name },
        remoteRuntimeEpoch: remote.runtimeEpoch
      }
    } catch (error) {
      if (!(error instanceof OrchestrationError) || error.code !== 'method_not_found') {
        throw error
      }
      return readLegacyFederatedTerminal({
        runtime,
        server,
        federated,
        workerState: db.getWorkerDispatch(params.dispatch)?.state ?? 'unknown',
        dispatchId: params.dispatch,
        source: params.source,
        cursor: params.cursor,
        limit: params.limit
      })
    }
  }
  const worker = db.getWorkerDispatch(params.dispatch)
  if (!worker?.agent_terminal_handle) {
    throw new OrchestrationError(
      'dispatch_not_found',
      `Worker Dispatch ${params.dispatch} has no agent terminal.`
    )
  }
  const observation = await inspectWorkerTerminal(runtime, db, params.dispatch)
  if (!observation.exact) {
    throw new OrchestrationError(
      'worker_identity_changed',
      `Worker Dispatch ${params.dispatch} no longer resolves to its exact process.`
    )
  }
  const output = await readExactWorkerOutput({
    runtime,
    dispatchId: params.dispatch,
    terminalHandle: worker.agent_terminal_handle,
    workerState: worker.state,
    terminalStatus: observation.status === 'exited' ? 'exited' : 'running',
    attachedAt: worker.created_at,
    source: params.source,
    cursor: params.cursor,
    limit: params.limit
  })
  const afterRead = await inspectWorkerTerminal(runtime, db, params.dispatch)
  if (!afterRead.exact) {
    throw new OrchestrationError(
      'worker_identity_changed',
      `Worker Dispatch ${params.dispatch} changed process while output was read.`
    )
  }
  return output
}

async function readLegacyFederatedTerminal(args: {
  runtime: Parameters<typeof resolvePinnedFederatedServer>[0]
  server: ReturnType<typeof resolvePinnedFederatedServer>
  federated: Parameters<typeof resolvePinnedFederatedServer>[1]
  workerState: string
  dispatchId: string
  source: (typeof ORCHESTRATION_WORKER_READ_SOURCES)[number] | undefined
  cursor: string | number | undefined
  limit: number | undefined
}) {
  const cursor = decodeWorkerOutputCursor(args.cursor, args.dispatchId)
  if (args.source === 'transcript' || cursor?.source === 'transcript') {
    throw new OrchestrationError(
      'transcript_required',
      `Connected worker host ${args.server.name} does not support structured worker output.`,
      { reason: 'remote_capability_unavailable' }
    )
  }
  const remote = await args.runtime.callOrchestrationWorkerServer(
    args.server.environmentId,
    ORCHESTRATION_FEDERATION_READ_CONTRACT,
    {
      dispatchId: args.dispatchId,
      cursor: cursor?.source === 'terminal' ? cursor.position : undefined,
      limit: args.limit
    },
    15_000
  )
  const sourceIdentity = createWorkerOutputSourceIdentity([
    'legacy-remote-terminal',
    args.federated.peer_fingerprint,
    args.dispatchId,
    remote.runtimeEpoch
  ])
  if (
    cursor?.source === 'terminal' &&
    cursor.sourceIdentity !== null &&
    cursor.sourceIdentity !== sourceIdentity
  ) {
    throw new OrchestrationError(
      'source_changed',
      'The worker output source changed. Start a fresh worker-read without the old cursor.'
    )
  }
  const nextPosition =
    remote.terminal.nextCursor !== null && /^\d+$/.test(remote.terminal.nextCursor)
      ? Number.parseInt(remote.terminal.nextCursor, 10)
      : null
  return {
    dispatchId: args.dispatchId,
    source: 'terminal' as const,
    sourceIdentity,
    terminal: remote.terminal,
    cursor:
      nextPosition === null
        ? null
        : encodeWorkerOutputCursor(args.dispatchId, 'terminal', sourceIdentity, nextPosition),
    status: { worker: args.workerState, terminal: remote.terminal.status },
    fallbackReason: 'remote_capability_unavailable' as const,
    warnings: [],
    server: { environmentId: args.server.environmentId, name: args.server.name },
    remoteRuntimeEpoch: remote.runtimeEpoch
  }
}
