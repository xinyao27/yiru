import { join } from 'node:path'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'

export function getTraceFilePath(): string {
  return join(getRuntimeHostPathsProvider().userDataPath(), 'logs', 'daemon.trace.ndjson')
}
