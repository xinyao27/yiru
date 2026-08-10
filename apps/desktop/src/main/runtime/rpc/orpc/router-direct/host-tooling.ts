import {
  checkRuntimeUpdater,
  downloadRuntimeUpdater,
  getRuntimeUpdaterStatus,
  installRuntimeUpdater
} from '~main/runtime/rpc/methods/updater'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: Electron main injects the desktop updater adapter. The standalone host
// wires the same leaves against the default headless adapter in host/router.ts.
export const electronHostToolingRuntimeHandlers = {
  updater: {
    getStatus: runtimeImplementation.updater.getStatus.handler(
      wireRuntimeMethod('updater.getStatus', getRuntimeUpdaterStatus)
    ),
    check: runtimeImplementation.updater.check.handler(
      wireRuntimeMethod('updater.check', checkRuntimeUpdater)
    ),
    download: runtimeImplementation.updater.download.handler(
      wireRuntimeMethod('updater.download', downloadRuntimeUpdater)
    ),
    install: runtimeImplementation.updater.install.handler(
      wireRuntimeMethod('updater.install', installRuntimeUpdater)
    )
  }
} as const
