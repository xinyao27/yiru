import { describe, expect, it } from 'vite-plus/test'
import { addYiruWslInteropEnv } from './wsl-yiru-env'

describe('addYiruWslInteropEnv', () => {
  it('marks the Yiru terminal handle for Windows to WSL env import', () => {
    const env: Record<string, string> = { YIRU_TERMINAL_HANDLE: 'term_wsl' }

    addYiruWslInteropEnv(env)

    expect(env.WSLENV).toBe('YIRU_TERMINAL_HANDLE/u')
  })

  it('preserves existing WSLENV entries and does not duplicate the handle entry', () => {
    const env: Record<string, string> = {
      WSLENV: 'FOO/u:YIRU_TERMINAL_HANDLE/u:BAR/p'
    }

    addYiruWslInteropEnv(env)

    expect(env.WSLENV).toBe('FOO/u:YIRU_TERMINAL_HANDLE/u:BAR/p')
  })

  it('marks OMP status and hook env for Windows to WSL import', () => {
    const env: Record<string, string> = {
      YIRU_TERMINAL_HANDLE: 'term_wsl',
      YIRU_USER_DATA_PATH: 'C:\\Users\\jin\\AppData\\Roaming\\Yiru',
      YIRU_CLI_COMMAND: 'yiru',
      YIRU_OMP_STATUS_EXTENSION: 'C:\\Users\\jin\\.omp\\agent\\extensions\\yiru-agent-status.ts',
      YIRU_PANE_KEY: 'tab-1:leaf-1',
      YIRU_TAB_ID: 'tab-1',
      YIRU_WORKTREE_ID: 'repo::\\\\wsl.localhost\\Ubuntu\\home\\jin\\repo',
      YIRU_AGENT_HOOK_PORT: '4567',
      YIRU_AGENT_HOOK_TOKEN: 'token',
      YIRU_AGENT_HOOK_ENV: 'dev',
      YIRU_AGENT_HOOK_VERSION: '1'
    }

    addYiruWslInteropEnv(env)

    expect(env.WSLENV).toContain('YIRU_TERMINAL_HANDLE/u')
    expect(env.WSLENV).toContain('YIRU_USER_DATA_PATH/p')
    expect(env.WSLENV).toContain('YIRU_CLI_COMMAND/u')
    expect(env.WSLENV).toContain('YIRU_OMP_STATUS_EXTENSION/p')
    expect(env.WSLENV).toContain('YIRU_PANE_KEY/u')
    expect(env.WSLENV).toContain('YIRU_TAB_ID/u')
    expect(env.WSLENV).toContain('YIRU_WORKTREE_ID/u')
    expect(env.WSLENV).toContain('YIRU_AGENT_HOOK_PORT/u')
    expect(env.WSLENV).toContain('YIRU_AGENT_HOOK_TOKEN/u')
    expect(env.WSLENV).toContain('YIRU_AGENT_HOOK_ENV/u')
    expect(env.WSLENV).toContain('YIRU_AGENT_HOOK_VERSION/u')
  })

  it('path-translates a Windows hook endpoint but passes a guest-side one untouched', () => {
    const windowsEnv: Record<string, string> = {
      YIRU_AGENT_HOOK_ENDPOINT: 'C:\\Users\\jin\\AppData\\Roaming\\Yiru\\agent-hooks\\endpoint.cmd'
    }
    addYiruWslInteropEnv(windowsEnv)
    expect(windowsEnv.WSLENV).toContain('YIRU_AGENT_HOOK_ENDPOINT/p')

    const guestEnv: Record<string, string> = {
      YIRU_AGENT_HOOK_ENDPOINT: '/home/jin/.yiru-wsl/agent-hooks/port-4567/endpoint.env'
    }
    addYiruWslInteropEnv(guestEnv)
    expect(guestEnv.WSLENV).toContain('YIRU_AGENT_HOOK_ENDPOINT/u')
    expect(guestEnv.WSLENV).not.toContain('YIRU_AGENT_HOOK_ENDPOINT/p')
  })

  it('marks the WSL hook relay version for import on relay spawn envs', () => {
    const env: Record<string, string> = { YIRU_WSL_HOOK_RELAY_VERSION: '0.1.0+abc' }
    addYiruWslInteropEnv(env)
    expect(env.WSLENV).toBe('YIRU_WSL_HOOK_RELAY_VERSION/u')
  })
})
