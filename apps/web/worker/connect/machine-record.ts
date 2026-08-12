import {
  BrowserIdentitySchema,
  MachineSigningKeySchema,
  type BrowserIdentity,
  type MachineSigningKey
} from '@yiru/runtime-protocol/web-connect'

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
  return parseMachineRecord(await state.storage.get<unknown>(MACHINE_STORAGE_KEY))
}

function parseMachineRecord(value: unknown): MachineRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const machineValue = Reflect.get(value, 'machine')
  if (!machineValue || typeof machineValue !== 'object') {
    return null
  }
  const id = Reflect.get(machineValue, 'id')
  const signingKey = MachineSigningKeySchema.safeParse(Reflect.get(machineValue, 'signingKey'))
  const browserValues = Reflect.get(value, 'browsers')
  const tickets = readTickets(Reflect.get(value, 'tickets'))
  const usedNonces = readNumberRecord(Reflect.get(value, 'usedNonces'))
  if (typeof id !== 'string' || !signingKey.success || !Array.isArray(browserValues)) {
    return null
  }
  const browsers = browserValues.flatMap((browserValue) => {
    if (!browserValue || typeof browserValue !== 'object') {
      return []
    }
    const browserId = Reflect.get(browserValue, 'id')
    const identity = BrowserIdentitySchema.safeParse(Reflect.get(browserValue, 'identity'))
    return typeof browserId === 'string' && identity.success
      ? [{ id: browserId, identity: identity.data }]
      : []
  })
  return browsers.length === browserValues.length && tickets && usedNonces
    ? { machine: { id, signingKey: signingKey.data }, browsers, tickets, usedNonces }
    : null
}

function readTickets(value: unknown): MachineRecord['tickets'] | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const entries = Object.entries(value)
  const tickets: MachineRecord['tickets'] = {}
  for (const [key, ticket] of entries) {
    if (!ticket || typeof ticket !== 'object') {
      return null
    }
    const browserId = Reflect.get(ticket, 'browserId')
    const expiresAt = Reflect.get(ticket, 'expiresAt')
    if (typeof browserId !== 'string' || typeof expiresAt !== 'number') {
      return null
    }
    tickets[key] = { browserId, expiresAt }
  }
  return tickets
}

function readNumberRecord(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const entries = Object.entries(value)
  return entries.every((entry) => typeof entry[1] === 'number') ? Object.fromEntries(entries) : null
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
