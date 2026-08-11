import type { YiruRuntimeService } from '../yiru-runtime'
import type { TerminalMultiplexSubscribeRecord } from './stream-records'

export type TerminalMultiplexStreamAdmission =
  | { accepted: true; ptyId: string }
  | {
      accepted: false
      code: 'terminal_handle_stale' | 'no_connected_pty' | 'stale_transport_generation'
      message: string
    }

export function admitTerminalMultiplexStream(
  runtime: YiruRuntimeService,
  record: TerminalMultiplexSubscribeRecord
): TerminalMultiplexStreamAdmission {
  let ptyId: string | null = null
  try {
    ptyId = runtime.resolveLiveLeafForHandle(record.terminal)?.ptyId ?? null
  } catch {
    return {
      accepted: false,
      code: 'terminal_handle_stale',
      message: 'Terminal handle is stale'
    }
  }
  if (!ptyId) {
    return {
      accepted: false,
      code: 'no_connected_pty',
      message: 'Terminal has no connected PTY'
    }
  }
  if (runtime.getTerminalTransportGeneration(ptyId) !== record.transportGeneration) {
    return {
      accepted: false,
      code: 'stale_transport_generation',
      message: 'Terminal transport changed'
    }
  }
  return { accepted: true, ptyId }
}
