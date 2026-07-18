import { z } from 'zod'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { AuthenticatedSpoolPrincipal } from '../../shared/rpc-principal'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import { SpoolExecutionGateway } from './spool-execution-gateway'
import { createSpoolRpcRegistry } from './spool-rpc-gateway'
import { SPOOL_CANCEL_REQUEST_METHOD } from './spool-rpc-cancellation'
import { SpoolGatewayConnection } from './spool-rpc-server-connection'
import { createSpoolRpcStream } from './spool-rpc-stream'

const principal: AuthenticatedSpoolPrincipal = {
  kind: 'spool',
  connectionId: 'connection-one',
  channelKeyFingerprint: 'fingerprint-one',
  tailnet: {
    nodeId: 'node-one',
    sourceAddress: '100.64.0.1',
    userDisplayName: 'Requester',
    nodeDisplayName: 'requester-device'
  }
}

const worktree: SpoolPublicWorktreeInstance = {
  worktreeId: 'worktree-one',
  instanceId: 'instance-one',
  projectId: 'project-one',
  shareEpoch: 'share-one',
  spoolIncarnationId: 'incarnation-one',
  actualHostScope: 'local-owner',
  ownerWorktree: {
    kind: 'git',
    worktreeId: 'worktree-one',
    instanceId: 'instance-one',
    projectId: 'project-one',
    repoId: 'repo-one',
    executionHostId: 'local',
    worktreePath: '/repo/worktree-one'
  }
}

describe('Spool terminal subscription cancellation', () => {
  it('aborts a streaming setup when an older requester sends request cancellation', async () => {
    let setupSignal: AbortSignal | null = null
    const connection = new SpoolGatewayConnection(
      principal,
      { sendJson: vi.fn(), close: vi.fn() },
      {
        ownerRuntimeId: 'owner-one',
        registry: createSpoolRpcRegistry([
          {
            name: 'terminal.test',
            schema: z.object({}).strict(),
            access: 'worktree-read',
            streaming: true,
            bind: () => ({ value: null, isCurrent: () => true }),
            execute: () =>
              createSpoolRpcStream(
                async (_sink, context) =>
                  await new Promise<void>((resolve) => {
                    setupSignal = context.signal
                    context.signal.addEventListener('abort', () => resolve(), { once: true })
                  })
              ),
            project: (value) => value
          }
        ]),
        authorize: () => undefined
      }
    )
    connection.dispatchJson(
      JSON.stringify({ id: 'terminal-request', method: 'terminal.test', params: {} })
    )
    await vi.waitFor(() => expect(setupSignal).not.toBeNull())

    connection.dispatchJson(
      JSON.stringify({
        id: 'cancel-request',
        method: SPOOL_CANCEL_REQUEST_METHOD,
        params: { requestId: 'terminal-request' }
      })
    )

    await vi.waitFor(() => expect(setupSignal?.aborted).toBe(true))
    connection.close()
  })

  it('releases execution capacity when streaming setup is aborted', async () => {
    const downstreamClose = vi.fn()
    const gateway = new SpoolExecutionGateway({
      resolveAdapter: () => ({
        invoke: async () => ({}),
        subscribe: () => ({ close: downstreamClose })
      }),
      captureControlGeneration: () => 'control-one',
      revalidateTarget: async () => true
    })
    for (let attempt = 0; attempt < 10; attempt++) {
      const controller = new AbortController()
      const subscription = await gateway.subscribe(
        {
          connectionId: principal.connectionId,
          worktree,
          isCurrent: () => true
        },
        { kind: 'terminal.subscribe', terminalRef: 'terminal-one' },
        () => undefined,
        controller.signal
      )

      controller.abort()
      await vi.waitFor(() => expect(downstreamClose).toHaveBeenCalledTimes(attempt + 1))
      subscription.close()
    }
  })
})
