import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const launchAgentInNewTab = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const store = vi.hoisted(() => ({
  settings: { disabledTuiAgents: [] as string[] },
  ensureDetectedAgents: vi.fn(async () => ['claude', 'codex']),
  ensureRemoteDetectedAgents: vi.fn(async () => ['claude', 'codex']),
  ensureRuntimeDetectedAgents: vi.fn(async () => ['claude', 'codex'])
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab }))
vi.mock('@/lib/agent-catalog', () => ({
  getAgentLabel: (agent: string) => (agent === 'codex' ? 'Codex' : 'Claude')
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionIdFromState: () => null }))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: () => null
}))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    Object.entries(values ?? {}).reduce(
      (message, [key, value]) => message.replace(`{{${key}}}`, value),
      fallback
    )
}))

describe('agent session continuation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    launchAgentInNewTab.mockReturnValue({
      tabId: 'tab-codex',
      promptDeliveryResult: Promise.resolve({ delivered: true, failureNotified: false })
    })
    vi.stubGlobal('window', {
      api: { agentTrust: { markTrusted: vi.fn(async () => undefined) } }
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('continues Claude context in a new Codex session', async () => {
    const { buildAgentSessionContinuationPrompt } = await import('./agent-session-continuation')
    const { launchAgentSessionContinuation } = await import('./launch-agent-session-continuation')
    const prompt = buildAgentSessionContinuationPrompt(
      {
        sourceAgent: 'claude',
        capturedText: 'User: diagnose the regression\nAssistant: the parser still needs a fix'
      },
      'focused'
    )

    expect(prompt).toContain('Original agent: claude')
    await expect(
      launchAgentSessionContinuation({
        agent: 'codex',
        prompt: prompt ?? '',
        worktreeId: 'wt-1',
        workspacePath: '/repo/worktree',
        launchSource: 'terminal_context_menu'
      })
    ).resolves.toBe(true)

    expect(launchAgentInNewTab).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        prompt: expect.stringContaining('Original agent: claude'),
        promptDelivery: 'submit-after-ready',
        worktreeId: 'wt-1'
      })
    )
  })
})
