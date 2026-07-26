import type { YiruRuntimeService } from '../../yiru-runtime'
import { CoworkingHostSessionPageCursors } from './coworking-host-session-page-cursors'

const stores = new WeakMap<YiruRuntimeService, CoworkingHostSessionPageCursors>()

export function getCoworkingHostSessionPageCursors(
  runtime: YiruRuntimeService
): CoworkingHostSessionPageCursors {
  const existing = stores.get(runtime)
  if (existing) {
    return existing
  }
  const created = new CoworkingHostSessionPageCursors()
  stores.set(runtime, created)
  return created
}
