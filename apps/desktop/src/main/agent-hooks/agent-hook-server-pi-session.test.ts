import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: () => ({}) }))

import { makePaneKey } from '../../shared/stable-pane-id'
import { AgentHookServer } from './server'

describe('AgentHookServer Pi resume identity', () => {
  it('hydrates persisted metadata-only identity as replay-safe state', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'yiru-pi-hook-test-'))
    const paneKey = makePaneKey('tab-1', '33333333-3333-4333-8333-333333333333')
    const providerSession = {
      key: 'session_id' as const,
      id: 'pi-session-hydrated',
      transcriptPath: join(tmpdir(), 'yiru-pi-session-hydrated.jsonl')
    }
    const firstServer = new AgentHookServer()
    const hydratedServer = new AgentHookServer()

    try {
      await firstServer.start({ env: 'production', userDataPath })
      firstServer.ingestRemote(
        {
          paneKey,
          providerSession,
          providerSessionOnly: true,
          payload: { state: 'done', prompt: '', agentType: 'pi' }
        },
        'ssh-connection-1'
      )
      firstServer.flushStatusPersistSync()
      firstServer.stop()

      await hydratedServer.start({ env: 'production', userDataPath })
      const listener = vi.fn()
      hydratedServer.setListener(listener)

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          paneKey,
          providerSession,
          providerSessionOnly: true,
          isReplay: true
        })
      )
      expect(hydratedServer.getStatusChangeSnapshot()).toEqual([])
    } finally {
      firstServer.stop()
      hydratedServer.stop()
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })

  it('persists and relays valid SSH metadata without exposing a status change', () => {
    const server = new AgentHookServer()
    const listener = vi.fn()
    const paneKey = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')
    const providerSession = {
      key: 'session_id' as const,
      id: 'pi-session-1',
      transcriptPath: join(tmpdir(), 'yiru-pi-session-1.jsonl')
    }
    server.setListener(listener)

    server.ingestRemote(
      {
        paneKey,
        worktreeId: 'worktree-1',
        providerSession,
        providerSessionOnly: true,
        payload: { state: 'done', prompt: '', agentType: 'pi' }
      },
      'ssh-connection-1'
    )

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        paneKey,
        connectionId: 'ssh-connection-1',
        providerSession,
        providerSessionOnly: true
      })
    )
    expect(server.getStatusSnapshot()).toEqual([
      expect.objectContaining({ paneKey, providerSession, providerSessionOnly: true })
    ])
    expect(server.getStatusChangeSnapshot()).toEqual([])
  })

  it('rejects metadata-only Pi relay events without a session file', () => {
    const server = new AgentHookServer()
    const listener = vi.fn()
    server.setListener(listener)

    server.ingestRemote(
      {
        paneKey: makePaneKey('tab-1', '22222222-2222-4222-8222-222222222222'),
        providerSession: { key: 'session_id', id: 'legacy-pi-session' },
        providerSessionOnly: true,
        payload: { state: 'done', prompt: '', agentType: 'pi' }
      },
      'ssh-connection-1'
    )

    expect(listener).not.toHaveBeenCalled()
    expect(server.getStatusSnapshot()).toEqual([])
  })
})
