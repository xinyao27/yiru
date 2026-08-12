import {
  installRuntimeCli,
  installRuntimeWslCli,
  readRuntimeCliInstallStatus,
  readRuntimeWslCliInstallStatus,
  removeRuntimeCli,
  removeRuntimeWslCli
} from '~main/runtime/rpc/methods/cli'
import { openRuntimeRemoteSshEditor } from '~main/runtime/rpc/methods/external-editor'
import {
  handleAgentTrustMarkTrusted,
  handleHostGitBashIsAvailable,
  handleHostPlatform,
  handleHostPwshIsAvailable,
  handleHostWslIsAvailable,
  handleHostWslListDistros
} from '~main/runtime/rpc/methods/host-capabilities'
import {
  detectRemoteRuntimeAgents,
  detectRuntimeAgents,
  refreshRuntimeAgents,
  runRuntimePreflightCheck
} from '~main/runtime/rpc/methods/preflight'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

export const portableHostToolingRuntimeHandlers = {
  cli: {
    installStatus: runtimeImplementation.cli.installStatus.handler(
      wireRuntimeMethod('cli.installStatus', readRuntimeCliInstallStatus)
    ),
    install: runtimeImplementation.cli.install.handler(
      wireRuntimeMethod('cli.install', installRuntimeCli)
    ),
    remove: runtimeImplementation.cli.remove.handler(
      wireRuntimeMethod('cli.remove', removeRuntimeCli)
    ),
    wslInstallStatus: runtimeImplementation.cli.wslInstallStatus.handler(
      wireRuntimeMethod('cli.wslInstallStatus', readRuntimeWslCliInstallStatus)
    ),
    wslInstall: runtimeImplementation.cli.wslInstall.handler(
      wireRuntimeMethod('cli.wslInstall', installRuntimeWslCli)
    ),
    wslRemove: runtimeImplementation.cli.wslRemove.handler(
      wireRuntimeMethod('cli.wslRemove', removeRuntimeWslCli)
    )
  },
  externalEditor: {
    // Why: the portable implementation rejects every non-empty connectionId
    // before local path resolution or process launch.
    openRemoteSsh: runtimeImplementation.externalEditor.openRemoteSsh.handler(
      wireRuntimeMethod('externalEditor.openRemoteSsh', openRuntimeRemoteSshEditor)
    )
  },
  host: {
    platform: runtimeImplementation.host.platform.handler(
      wireRuntimeMethod('host.platform', handleHostPlatform)
    ),
    wsl: {
      isAvailable: runtimeImplementation.host.wsl.isAvailable.handler(
        wireRuntimeMethod('host.wsl.isAvailable', handleHostWslIsAvailable)
      ),
      listDistros: runtimeImplementation.host.wsl.listDistros.handler(
        wireRuntimeMethod('host.wsl.listDistros', handleHostWslListDistros)
      )
    },
    pwsh: {
      isAvailable: runtimeImplementation.host.pwsh.isAvailable.handler(
        wireRuntimeMethod('host.pwsh.isAvailable', handleHostPwshIsAvailable)
      )
    },
    gitBash: {
      isAvailable: runtimeImplementation.host.gitBash.isAvailable.handler(
        wireRuntimeMethod('host.gitBash.isAvailable', handleHostGitBashIsAvailable)
      )
    },
    agentTrust: {
      markTrusted: runtimeImplementation.host.agentTrust.markTrusted.handler(
        wireRuntimeMethod('host.agentTrust.markTrusted', handleAgentTrustMarkTrusted)
      )
    }
  },
  preflight: {
    check: runtimeImplementation.preflight.check.handler(
      wireRuntimeMethod('preflight.check', runRuntimePreflightCheck)
    ),
    detectAgents: runtimeImplementation.preflight.detectAgents.handler(
      wireRuntimeMethod('preflight.detectAgents', detectRuntimeAgents)
    ),
    detectRemoteAgents: runtimeImplementation.preflight.detectRemoteAgents.handler(
      wireRuntimeMethod('preflight.detectRemoteAgents', detectRemoteRuntimeAgents)
    ),
    refreshAgents: runtimeImplementation.preflight.refreshAgents.handler(
      wireRuntimeMethod('preflight.refreshAgents', refreshRuntimeAgents)
    )
  }
} as const
