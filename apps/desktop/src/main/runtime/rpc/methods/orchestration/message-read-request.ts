import { z } from 'zod'

import {
  OptionalBoolean,
  OptionalFiniteNumber,
  OptionalString
} from '../../../../../shared/runtime-method-contracts/runtime-method-params'
import type { MessageType } from '../../../orchestration/db'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import { MESSAGE_TYPES } from '../../../orchestration/types'

export const MessageReadParams = z
  .object({
    terminal: OptionalString,
    terminalPaneKey: OptionalString,
    unread: OptionalBoolean,
    peek: OptionalBoolean,
    // Why: all is a non-mutating history mode; the false unread value is its
    // one-release compatibility encoding.
    all: OptionalBoolean,
    types: OptionalString,
    format: OptionalBoolean,
    // Why: one-release RPC compatibility only; the public CLI uses formatted output.
    inject: OptionalBoolean,
    ack: OptionalString,
    run: OptionalString,
    wait: OptionalBoolean,
    timeoutMs: OptionalFiniteNumber
  })
  .superRefine((params, ctx) => {
    // Why: the CLI sends peek with unread=false for older runtimes, so that pair is one mode.
    const modes = [
      params.unread === true,
      params.peek === true,
      params.all === true || (params.unread === false && params.peek !== true)
    ].filter(Boolean)
    if (modes.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose at most one message read mode: --unread, --peek, or --all.'
      })
    }
  })

export function parseMessageTypes(rawTypes: string | undefined): MessageType[] | undefined {
  const types = rawTypes
    ?.split(',')
    .map((type) => type.trim())
    .filter(Boolean) as MessageType[] | undefined
  const invalidTypes = types?.filter((type) => !MESSAGE_TYPES.includes(type))
  if (invalidTypes && invalidTypes.length > 0) {
    throw new OrchestrationError('invalid_argument', `Invalid --types: ${invalidTypes.join(',')}`)
  }
  return types && types.length > 0 ? types : undefined
}
