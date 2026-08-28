import { TerminalCreateInputSchema } from '@yiru/runtime-protocol/contract'

export function parseLaunchAgent(value: string | undefined) {
  if (value === undefined) {
    return undefined
  }
  const parsed = TerminalCreateInputSchema.safeParse({ launchAgent: value })
  if (!parsed.success) {
    throw new Error('unknown_agent')
  }
  return parsed.data.launchAgent
}
