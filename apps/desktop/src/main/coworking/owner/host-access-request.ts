import type { CoworkingRequestHostAccessResult } from '~shared/coworking/ipc-contract'

import type { CoworkingPeerConnection } from '../peer/connection'
import { CoworkingPeerConnectionError } from '../peer/connection-contract'
import { requestCoworkingHostAccess } from './host-access'
import type { CoworkingOwnerRecord } from './record'

export async function reconnectCoworkingOwnerHostAccess(
  record: CoworkingOwnerRecord,
  isStarted: () => boolean,
  isCurrent: (record: CoworkingOwnerRecord) => boolean,
  handleConnectionLoss: (
    record: CoworkingOwnerRecord,
    connection: CoworkingPeerConnection | null
  ) => void,
  connect: (record: CoworkingOwnerRecord) => Promise<void>
): Promise<void> {
  if (!isStarted() || !isCurrent(record)) {
    throw new Error('resource_unavailable')
  }

  handleConnectionLoss(record, record.connection)

  if (record.reconnectTimer) {
    clearTimeout(record.reconnectTimer)
    record.reconnectTimer = null
  }

  await connect(record)

  if (record.status !== 'connected' || !record.connection) {
    throw new Error('resource_unavailable')
  }
}

export async function requestCoworkingOwnerHostAccess(
  record: CoworkingOwnerRecord | undefined,
  userDataPath: string,
  reconnect: (record: CoworkingOwnerRecord) => Promise<void>
): Promise<CoworkingRequestHostAccessResult> {
  const request = (): Promise<CoworkingRequestHostAccessResult> =>
    requestCoworkingHostAccess(record, userDataPath)

  try {
    return await request()
  } catch (error) {
    if (
      !(error instanceof CoworkingPeerConnectionError) ||
      error.code !== 'disconnected' ||
      !record
    ) {
      throw error
    }

    // Why: a failed pre-send must reconnect before retrying the authorization mutation;
    // in-flight mutations are projected as outcome_unknown and never enter this branch.
    await reconnect(record)
    return await request()
  }
}
