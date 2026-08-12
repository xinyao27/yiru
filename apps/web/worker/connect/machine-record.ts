import type { BrowserIdentity, MachineSigningKey } from '@yiru/runtime-protocol/web-connect'

export type MachineRecord = {
  machine: { id: string; signingKey: MachineSigningKey }
  browsers: { id: string; identity: BrowserIdentity }[]
  tickets: Record<string, { browserId: string; expiresAt: number }>
  usedNonces: Record<string, number>
}

export const MACHINE_STORAGE_KEY = 'machine'
export const TICKET_TTL_MS = 30_000

const MAX_EPHEMERAL_RECORDS = 128

export async function readMachine(state: DurableObjectState): Promise<MachineRecord | null> {
  return (await state.storage.get<MachineRecord>(MACHINE_STORAGE_KEY)) ?? null
}

export function trimEphemeralRecord(record: Record<string, { expiresAt: number } | number>): void {
  const entries = Object.entries(record).sort(
    (left, right) => recordTime(right[1]) - recordTime(left[1])
  )
  for (const [key] of entries.slice(MAX_EPHEMERAL_RECORDS)) {
    delete record[key]
  }
}

function recordTime(value: { expiresAt: number } | number): number {
  return typeof value === 'number' ? value : value.expiresAt
}
