import type { CliInstallStatus } from '@yiru/runtime-protocol/workbench/cli-install-types'

import {
  createCliInstallContext,
  type CliInstallContext,
  type CliInstallerOptions
} from './installer-context'
import { getBundledLauncherPath } from './installer-launchers'
import { installCli, removeCli } from './installer-operations'
import { getCliInstallStatus } from './installer-status'

export { getBundledLauncherPath }

export class CliInstaller {
  private readonly context: CliInstallContext

  constructor(options: CliInstallerOptions = {}) {
    this.context = createCliInstallContext(options)
  }

  getStatus(): Promise<CliInstallStatus> {
    return getCliInstallStatus(this.context)
  }

  install(): Promise<CliInstallStatus> {
    return installCli(this.context)
  }

  remove(): Promise<CliInstallStatus> {
    return removeCli(this.context)
  }
}
