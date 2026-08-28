import { containsCsiRendererQuery } from '~renderer/terminal/reply-query-extraction'

import { isKnownTuiAgentTerminalStartupCommand } from '../terminal-startup-command-classifier'
import type { PtyConnectionDeps } from './connection-types'

export function shouldKeepHiddenStartupRendererQueriesLive(
  startup: PtyConnectionDeps['startup']
): boolean {
  return (
    Boolean(startup?.telemetry?.agent_kind && startup.telemetry.agent_kind !== 'other') ||
    isKnownTuiAgentTerminalStartupCommand(startup?.command ?? '')
  )
}

export function containsHiddenStartupRendererQuery(data: string): boolean {
  // Why: query chunks must reach xterm so hidden TUIs receive their terminal replies.
  return containsCsiRendererQuery(data) || data.includes('\x1b]10;?') || data.includes('\x1b]11;?')
}
