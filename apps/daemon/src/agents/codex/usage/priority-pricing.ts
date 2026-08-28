import { normalizeCodexModel } from './model-names'

export function codexPriorityMultiplier(model: string | null): number | null {
  switch (normalizeCodexModel(model)) {
    case 'gpt-5.4':
    case 'gpt-5.4-mini':
    case 'gpt-5.6-sol':
    case 'gpt-5.6-terra':
    case 'gpt-5.6-luna':
      return 2
    case 'gpt-5.5':
      return 2.5
    case null:
      return null
    default:
      return null
  }
}
