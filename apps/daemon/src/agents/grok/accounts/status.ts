import type { GrokAccountStatus } from '@yiru/runtime-protocol/workbench/rate-limit-types'
import { isGrokAccessTokenFresh, readGrokAuthSession } from '~main/rate-limits/grok-auth'

export function getGrokAccountStatus(): GrokAccountStatus {
  const readResult = readGrokAuthSession()
  if (readResult.status === 'missing') {
    return {
      signedIn: false,
      email: null,
      teamId: null,
      tokenFresh: false,
      error: null
    }
  }
  if (readResult.status === 'error') {
    return {
      signedIn: false,
      email: null,
      teamId: null,
      tokenFresh: false,
      error: readResult.error
    }
  }
  const session = readResult.session
  return {
    signedIn: true,
    email: session.email,
    teamId: session.teamId,
    tokenFresh: isGrokAccessTokenFresh(session),
    error: null
  }
}
