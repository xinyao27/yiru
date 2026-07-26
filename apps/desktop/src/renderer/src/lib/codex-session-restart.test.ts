import { describe, expect, it } from 'vite-plus/test'

import { shouldUseShellReadyStartupDelivery } from '../../../shared/codex-startup-delivery'
import { CODEX_ACCOUNT_RESTART_STARTUP } from './codex-session-restart'

describe('Codex account restart startup', () => {
  it('waits for shell readiness before relaunching Codex', () => {
    expect(CODEX_ACCOUNT_RESTART_STARTUP).toEqual({
      command: 'codex',
      startupCommandDelivery: 'shell-ready'
    })
    expect(shouldUseShellReadyStartupDelivery(CODEX_ACCOUNT_RESTART_STARTUP)).toBe(true)
  })
})
