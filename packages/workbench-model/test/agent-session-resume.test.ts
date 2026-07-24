import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { buildAgentResumeStartupPlan } from '../src/agent-resume-startup'
import {
  agentProviderSessionsEqual,
  extractAgentProviderSession,
  getAgentResumeArgv,
  isResumableTuiAgent,
  normalizeAgentProviderSession
} from '../src/agent-session-resume'

const PI_SESSION_FILE = join(tmpdir(), 'pi-session.jsonl')

describe('Pi session resume metadata', () => {
  it('captures and launches Pi by its authoritative session file', () => {
    const providerSession = extractAgentProviderSession('pi', {
      session_id: 'pi-session',
      session_file: PI_SESSION_FILE
    })

    expect(isResumableTuiAgent('pi')).toBe(true)
    expect(providerSession).toEqual({
      key: 'session_id',
      id: 'pi-session',
      transcriptPath: PI_SESSION_FILE
    })
    expect(getAgentResumeArgv('pi', providerSession!)).toEqual(['pi', '--session', PI_SESSION_FILE])
    expect(
      buildAgentResumeStartupPlan({
        agent: 'pi',
        providerSession: providerSession!,
        cmdOverrides: {},
        platform: 'linux'
      })
    ).toMatchObject({
      launchCommand: `pi '--session' '${PI_SESSION_FILE}'`,
      expectedProcess: 'pi'
    })
  })

  it('rejects ephemeral Pi sessions and unsafe persisted paths', () => {
    expect(extractAgentProviderSession('pi', { session_id: 'pi-session' })).toBeNull()
    expect(getAgentResumeArgv('pi', { key: 'session_id', id: 'pi-session' })).toBeNull()
    expect(
      normalizeAgentProviderSession({
        key: 'session_id',
        id: 'pi-session',
        transcriptPath: `${PI_SESSION_FILE}\nunsafe`
      })
    ).toEqual({ key: 'session_id', id: 'pi-session' })
  })

  it('compares Pi by file path while preserving id-only identity for other agents', () => {
    const first = { key: 'session_id' as const, id: 'same', transcriptPath: join(tmpdir(), 'one') }
    const second = { key: 'session_id' as const, id: 'same', transcriptPath: join(tmpdir(), 'two') }

    expect(agentProviderSessionsEqual('pi', first, second)).toBe(false)
    expect(agentProviderSessionsEqual('claude', first, second)).toBe(true)
  })
})

describe('OMP session resume metadata', () => {
  it('captures the provider id and builds an id-based cold resume', () => {
    const providerSession = extractAgentProviderSession('omp', {
      session_id: 'omp-session-1'
    })

    expect(isResumableTuiAgent('omp')).toBe(true)
    expect(providerSession).toEqual({ key: 'session_id', id: 'omp-session-1' })
    expect(getAgentResumeArgv('omp', providerSession!)).toEqual([
      'omp',
      '--resume',
      'omp-session-1'
    ])
    expect(
      buildAgentResumeStartupPlan({
        agent: 'omp',
        providerSession: providerSession!,
        cmdOverrides: {},
        platform: 'linux'
      })
    ).toMatchObject({
      launchCommand: "omp '--resume' 'omp-session-1'",
      expectedProcess: 'omp'
    })
  })

  it('preserves an explicit transcript locator across cold resume', () => {
    expect(
      buildAgentResumeStartupPlan({
        agent: 'omp',
        providerSession: { key: 'session_id', id: 'omp-session-1' },
        cmdOverrides: {},
        platform: 'win32',
        shell: 'powershell',
        ompResumeFilePath: String.raw`C:\omp\sessions\session.jsonl`
      })
    ).toMatchObject({
      launchCommand: "omp '--resume' 'C:\\omp\\sessions\\session.jsonl'",
      launchConfig: { ompResumeFilePath: String.raw`C:\omp\sessions\session.jsonl` }
    })
  })
})
