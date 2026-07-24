import { describe, expect, it, vi } from 'vite-plus/test'

import type { RpcClient } from '../transport/rpc-client'
import { createBlankWorkspace } from './blank-workspace-create'
import { createWorkspaceFromComposerSource } from './source-workspace-create'
import { buildMobileWorkspaceAgentLaunchFields } from './workspace-create-params'

const STARTUP_AGENT_CAPABILITY = 'workspace-create.startup-agent.v1'

function createClient() {
  const sendRequest = vi.fn().mockResolvedValue({
    id: 'request-1',
    ok: true,
    result: { worktree: { id: 'worktree-1' } },
    _meta: { runtimeId: 'runtime-1' }
  })
  return {
    client: { sendRequest } as unknown as RpcClient,
    sendRequest
  }
}

describe('Mobile workspace agent launch', () => {
  it('sends both launch forms while host capability support is unknown', () => {
    expect(
      buildMobileWorkspaceAgentLaunchFields({
        agentId: 'claude',
        startupCommand: 'claude --legacy-fallback',
        hostCapabilities: undefined
      })
    ).toEqual({
      startupAgent: 'claude',
      startupCommand: 'claude --legacy-fallback',
      createdWithAgent: 'claude'
    })
  })

  it('preserves unknown capability state through the blank workspace caller', async () => {
    const { client, sendRequest } = createClient()

    await createBlankWorkspace({
      client,
      repoId: 'repo-1',
      baseName: 'marlin',
      startupCommand: 'claude --legacy-fallback',
      createdWithAgentId: 'claude',
      hostCapabilities: undefined,
      comment: undefined,
      setupDecision: 'inherit'
    })

    expect(sendRequest.mock.calls[0]?.[1]).toMatchObject({
      startupAgent: 'claude',
      startupCommand: 'claude --legacy-fallback',
      createdWithAgent: 'claude'
    })
  })

  it('sends agent intent to a capable host instead of a client-built command', async () => {
    const { client, sendRequest } = createClient()

    await createBlankWorkspace({
      client,
      repoId: 'repo-1',
      baseName: 'marlin',
      startupCommand: 'claude --client-override',
      createdWithAgentId: 'claude',
      hostCapabilities: [STARTUP_AGENT_CAPABILITY],
      comment: undefined,
      setupDecision: 'inherit'
    })

    const params = sendRequest.mock.calls[0]?.[1] as Record<string, unknown>
    expect(params).toMatchObject({
      startupAgent: 'claude',
      createdWithAgent: 'claude'
    })
    expect(params).not.toHaveProperty('startupCommand')
  })

  it('keeps startupCommand for an older host without the capability', async () => {
    const { client, sendRequest } = createClient()

    await createBlankWorkspace({
      client,
      repoId: 'repo-1',
      baseName: 'marlin',
      startupCommand: 'claude --legacy-fallback',
      createdWithAgentId: 'claude',
      hostCapabilities: [],
      comment: undefined,
      setupDecision: 'inherit'
    })

    const params = sendRequest.mock.calls[0]?.[1] as Record<string, unknown>
    expect(params).toMatchObject({
      startupCommand: 'claude --legacy-fallback',
      createdWithAgent: 'claude'
    })
    expect(params).not.toHaveProperty('startupAgent')
  })

  it('uses agent intent for a new-branch source workspace on a capable host', async () => {
    const { client, sendRequest } = createClient()

    await createWorkspaceFromComposerSource({
      client,
      selection: { kind: 'new-branch', branchName: 'feature/mobile-agent' },
      targetRepoId: 'repo-1',
      setupDecision: 'inherit',
      agent: {
        choice: 'codex',
        startupCommand: 'codex --client-override',
        hostCapabilities: [STARTUP_AGENT_CAPABILITY]
      },
      workspaceName: undefined,
      note: undefined
    })

    const params = sendRequest.mock.calls[0]?.[1] as Record<string, unknown>
    expect(params).toMatchObject({
      startupAgent: 'codex',
      createdWithAgent: 'codex'
    })
    expect(params).not.toHaveProperty('startupCommand')
  })
})
