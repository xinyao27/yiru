import { describe, expect, it } from 'vitest'
import { SpoolExecutionError } from './spool-execution-error'
import { projectSpoolRpcErrorMessage } from './spool-rpc-error'

describe('Spool RPC error projection', () => {
  it('projects only the allowlisted internal diagnostic stage', () => {
    const error = new SpoolExecutionError('internal_error', 'session-consistency')
    error.cause = new Error('/Users/owner/private/worktree')

    expect(projectSpoolRpcErrorMessage(error)).toBe('internal_error:session-consistency')
  })

  it('does not project raw unknown error details', () => {
    expect(projectSpoolRpcErrorMessage(new Error('/Users/owner/private/worktree'))).toBe(
      'internal_error'
    )
  })
})
