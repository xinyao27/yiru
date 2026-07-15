import type { OrcaRuntimeService } from '../../orca-runtime'
import { SpoolHostSessionPageCursors } from './spool-host-session-page-cursors'

const stores = new WeakMap<OrcaRuntimeService, SpoolHostSessionPageCursors>()

export function getSpoolHostSessionPageCursors(
  runtime: OrcaRuntimeService
): SpoolHostSessionPageCursors {
  const existing = stores.get(runtime)
  if (existing) {
    return existing
  }
  const created = new SpoolHostSessionPageCursors()
  stores.set(runtime, created)
  return created
}
