import type { MessageType } from '~main/runtime/orchestration/db'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import { MESSAGE_TYPES } from '~main/runtime/orchestration/types'

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
