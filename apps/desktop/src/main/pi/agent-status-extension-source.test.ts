import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'

// TypeScript 7 is a native CLI; generated-source tests still need the JS API.
import ts from 'typescript-api'
import { describe, expect, it, vi } from 'vite-plus/test'

import { getPiAgentStatusExtensionSource } from './agent-status-extension-source'

type HookContext = {
  sessionManager?: {
    getSessionId?: () => unknown
    getSessionFile?: () => unknown
  }
}

type HookHandler = (event?: unknown, context?: HookContext) => void

function createHarness(
  sessionFileExists: () => boolean,
  kind: 'pi' | 'omp' = 'pi',
  processCommand: 'pi' | 'omp' = kind
) {
  const fetchMock = vi.fn(async (_url: string, _init?: { body?: string }) => ({ ok: true }))
  const fsMock = {
    existsSync: vi.fn(() => sessionFileExists()),
    statSync: vi.fn(),
    readFileSync: vi.fn()
  }
  const module = {
    exports: {} as { default?: (api: { on: (name: string, fn: HookHandler) => void }) => void }
  }
  const processMock = {
    env: {
      YIRU_PANE_KEY: 'tab-1:leaf-1',
      YIRU_AGENT_HOOK_PORT: '4321',
      YIRU_AGENT_HOOK_TOKEN: 'token-1'
    },
    pid: 4242,
    title: 'node',
    argv: ['node', processCommand]
  }
  const context = {
    module,
    exports: module.exports,
    require: (specifier: string) => {
      if (specifier === 'fs') {
        return fsMock
      }
      if (specifier === 'child_process') {
        return { spawn: vi.fn() }
      }
      throw new Error(`unexpected require(${specifier})`)
    },
    process: processMock,
    fetch: fetchMock,
    console,
    Promise,
    Buffer,
    URL,
    AbortController,
    setTimeout,
    clearTimeout
  } as Record<string, unknown>
  context.globalThis = context

  const output = ts.transpileModule(getPiAgentStatusExtensionSource(kind), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText
  runInNewContext(output, context)

  const handlers: Record<string, HookHandler> = {}
  module.exports.default?.({ on: (name, handler) => (handlers[name] = handler) })
  return { fetchMock, handlers }
}

describe('getPiAgentStatusExtensionSource', () => {
  it('keeps Pi-only session-start handling out of the OMP extension', () => {
    const source = getPiAgentStatusExtensionSource('omp')

    expect(source).toContain("const CONFIGURED_HOOK_PATH = '/hook/omp'")
    expect(source).not.toContain("pi.on('session_start'")
    expect(source).toContain('getSessionFile')
  })

  it.each([
    ['omp', 'omp'],
    ['pi', 'omp']
  ] as const)(
    'posts resumable OMP identity from a %s extension running under %s',
    async (kind, processCommand) => {
      const sessionFile = join(tmpdir(), `yiru-omp-${kind}.jsonl`)
      const harness = createHarness(() => true, kind, processCommand)

      harness.handlers.before_agent_start?.(
        { prompt: 'continue' },
        {
          sessionManager: {
            getSessionId: () => `omp-${kind}-session`,
            getSessionFile: () => sessionFile
          }
        }
      )

      await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(1))
      expect(String(harness.fetchMock.mock.calls[0]?.[0])).toContain('/hook/omp')
      expect(JSON.parse(String(harness.fetchMock.mock.calls[0]?.[1]?.body)).payload).toEqual({
        hook_event_name: 'before_agent_start',
        session_id: `omp-${kind}-session`,
        prompt: 'continue'
      })
    }
  )

  it('posts persisted Pi resume identity on session_start and later turn hooks', async () => {
    const sessionFile = join(tmpdir(), 'yiru-pi-session-1.jsonl')
    const harness = createHarness(() => true)

    harness.handlers.session_start?.(
      { reason: 'startup' },
      {
        sessionManager: {
          getSessionId: () => 'pi-session-1',
          getSessionFile: () => sessionFile
        }
      }
    )

    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(harness.fetchMock.mock.calls[0]?.[1]?.body)).payload).toEqual({
      hook_event_name: 'session_start',
      session_id: 'pi-session-1',
      session_file: sessionFile
    })

    harness.handlers.before_agent_start?.({ prompt: 'resume this task' })
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(harness.fetchMock.mock.calls[1]?.[1]?.body)).payload).toEqual({
      hook_event_name: 'before_agent_start',
      prompt: 'resume this task',
      session_id: 'pi-session-1',
      session_file: sessionFile
    })
  })

  it('withholds Pi resume identity until the planned session file exists', async () => {
    const sessionFile = join(tmpdir(), 'yiru-pi-session-pending.jsonl')
    let exists = false
    const harness = createHarness(() => exists)

    harness.handlers.session_start?.(
      { reason: 'startup' },
      {
        sessionManager: {
          getSessionId: () => 'pi-session-pending',
          getSessionFile: () => sessionFile
        }
      }
    )
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(harness.fetchMock.mock.calls[0]?.[1]?.body)).payload).toEqual({
      hook_event_name: 'session_start'
    })

    exists = true
    harness.handlers.before_agent_start?.({ prompt: 'continue' })
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(harness.fetchMock.mock.calls[1]?.[1]?.body)).payload).toMatchObject({
      session_id: 'pi-session-pending',
      session_file: sessionFile
    })
  })
})
