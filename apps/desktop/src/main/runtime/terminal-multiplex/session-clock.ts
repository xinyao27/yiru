import { randomBytes } from 'node:crypto'

export class TerminalMultiplexIdSequence {
  private next = 1

  allocate(): number {
    const id = this.next
    this.next = this.next === 0xffffffff ? 1 : this.next + 1
    return id
  }
}

export function randomTerminalMultiplexEpoch(): bigint {
  let value = 0n
  while (value === 0n) {
    value = randomBytes(8).readBigUInt64LE()
  }
  return value
}

export function randomTerminalMultiplexConnectionGeneration(): number {
  return randomBytes(4).readUInt32LE()
}

export function terminalMultiplexMonotonicMicros(): bigint {
  return BigInt(Math.floor(performance.now() * 1_000))
}
