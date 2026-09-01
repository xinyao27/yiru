import { clearMiniMaxSessionCookieJar } from '../../rate-limits/minimax-request-context'
import type { RateLimitService } from '../../rate-limits/service'
import {
  clearMiniMaxSessionCookie,
  hasMiniMaxSessionCookie,
  saveMiniMaxSessionCookie
} from './cookie-store'

export type MiniMaxCredentialsStatus = {
  configured: boolean
}

function getMiniMaxCredentialsStatus(): MiniMaxCredentialsStatus {
  return { configured: hasMiniMaxSessionCookie() }
}

// Why: fire-and-forget — callers get the persisted cookie status immediately;
// the rate-limit refresh runs in the background and only logs on failure.
function refreshAfterMiniMaxCredentialChange(
  rateLimits: RateLimitService | null,
  action: 'save' | 'clear'
): void {
  rateLimits?.invalidateMiniMaxCredentialState()
  void rateLimits?.refresh().catch((error: unknown) => {
    console.error(`[minimax] failed to trigger rate-limit refresh after ${action}:`, error)
  })
}

let shellRateLimits: RateLimitService | null = null

export function initializeShellMiniMaxCredentialsService(
  rateLimits: RateLimitService | null
): void {
  shellRateLimits = rateLimits
}

export function getShellMiniMaxCredentialsService() {
  return {
    getStatus: getMiniMaxCredentialsStatus,
    saveCookie: (cookie: string): MiniMaxCredentialsStatus => {
      saveMiniMaxSessionCookie(cookie)
      refreshAfterMiniMaxCredentialChange(shellRateLimits, 'save')
      return getMiniMaxCredentialsStatus()
    },
    clearCookie: async (): Promise<MiniMaxCredentialsStatus> => {
      clearMiniMaxSessionCookie()
      try {
        await clearMiniMaxSessionCookieJar()
      } catch (error) {
        console.error('[minimax] failed to clear session cookie jar after credential clear:', error)
      }
      refreshAfterMiniMaxCredentialChange(shellRateLimits, 'clear')
      return getMiniMaxCredentialsStatus()
    }
  }
}
