import type {
  RemoteServerUpdateInstallMode,
  RemoteServerUpdateSupport
} from '../shared/remote-server-update'

export function resolveRemoteServerUpdateSupport(args: {
  installMode: RemoteServerUpdateInstallMode
  isPackaged: boolean
  isDev: boolean
  updaterInitialized: boolean
}): RemoteServerUpdateSupport {
  if (!args.isPackaged || args.isDev) {
    return { installMode: args.installMode, automatic: false, reason: 'unpackaged-build' }
  }
  // Why: direct services on any OS, including SSH-launched serve processes,
  // have no restart owner; a remote quit could permanently strand the host.
  if (args.installMode === 'unsupported-headless-serve') {
    return {
      installMode: args.installMode,
      automatic: false,
      reason: 'manual-service-update-required'
    }
  }
  if (!args.updaterInitialized) {
    return { installMode: args.installMode, automatic: false, reason: 'updater-unavailable' }
  }
  return { installMode: args.installMode, automatic: true, reason: 'available' }
}
