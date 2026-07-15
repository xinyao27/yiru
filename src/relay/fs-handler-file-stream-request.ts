import type { RelayDispatcher, RequestContext } from './dispatcher'
import { SPOOL_SESSION_INVENTORY_STREAM_PROFILE } from '../shared/spool/spool-resource-limits'
import { parseRelayFileStreamProfile, readRelayFileStreamMetadata } from './fs-handler-file-read'
import type { RelayStreamRegistry } from './fs-stream-registry'

export function startRelayFileStream(
  filePath: string,
  params: Record<string, unknown>,
  dispatcher: RelayDispatcher,
  streamRegistry: RelayStreamRegistry,
  context?: RequestContext
) {
  const requestContext = context ?? { clientId: 0, isStale: () => false }
  const profile = parseRelayFileStreamProfile(params.profile)
  if (profile === SPOOL_SESSION_INVENTORY_STREAM_PROFILE && params.flowControl !== 'ack') {
    // Why: the elevated transcript cap is safe only when client acknowledgments
    // bound unconsumed chunks on the shared interactive SSH channel.
    throw new Error('Session inventory streams require ack flow control')
  }
  return readRelayFileStreamMetadata(
    filePath,
    dispatcher,
    streamRegistry,
    requestContext,
    {
      // Why: direct-call harnesses retain broadcast semantics, while real
      // streams target only the SSH client that owns their request id.
      ...(context ? { clientId: context.clientId } : {}),
      paceWithAcks: params.flowControl === 'ack'
    },
    profile
  )
}
