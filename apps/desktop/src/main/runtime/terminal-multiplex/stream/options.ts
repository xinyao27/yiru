import type { TerminalMultiplexOpcode } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import type { TerminalMultiplexStreamTelemetry } from '../telemetry'
import type { TerminalMultiplexSubscribeRecord } from './records'

export type TerminalMultiplexStreamOptions = {
  runtime: YiruRuntimeService
  routeId: number
  epoch: bigint
  connectionId: string
  subscribeCorrelationId: number
  record: TerminalMultiplexSubscribeRecord
  send: (
    opcode: TerminalMultiplexOpcode,
    routeId: number,
    seq: bigint,
    correlationId: number,
    payload?: Uint8Array<ArrayBufferLike>
  ) => boolean
  allocateSnapshotId: () => number
  connectionInFlightBytes: () => number
  connectionQueueBytes: () => number
  noteConnectionSent: (bytes: number) => void
  noteConnectionAck: (bytes: number) => void
  onClose: (routeId: number) => void
  telemetry: TerminalMultiplexStreamTelemetry
}
