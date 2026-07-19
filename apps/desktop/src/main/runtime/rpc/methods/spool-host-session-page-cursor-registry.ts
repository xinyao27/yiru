import type { YiruRuntimeService } from '../../yiru-runtime'
import { SpoolHostSessionPageCursors } from './spool-host-session-page-cursors'

const stores = new WeakMap<YiruRuntimeService, SpoolHostSessionPageCursors>()

export function getSpoolHostSessionPageCursors(
  runtime: YiruRuntimeService
): SpoolHostSessionPageCursors {
  const existing = stores.get(runtime)
  if (existing) {
    return existing
  }
  const created = new SpoolHostSessionPageCursors()
  stores.set(runtime, created)
  return created
}
