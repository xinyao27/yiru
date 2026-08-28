import { getWebRuntimeEnvironmentApi } from '../web/runtime-connection'
import { callShellOrpc, isWebRuntimeClient } from './orpc-client'
import type { RuntimeEnvironmentApi } from './runtime-environment-api'

export const runtimeEnvironmentsClient: RuntimeEnvironmentApi = {
  list: async () =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().list()
      : callShellOrpc((client) => client.shell.runtimeEnvironments.list, undefined),
  resolve: async (input) =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().resolve(input)
      : callShellOrpc((client) => client.shell.runtimeEnvironments.resolve, input),
  remove: async (input) =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().remove(input)
      : callShellOrpc((client) => client.shell.runtimeEnvironments.remove, input),
  disconnect: async (input) =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().disconnect(input)
      : callShellOrpc((client) => client.shell.runtimeEnvironments.disconnect, input),
  getStatus: async (input) =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().getStatus(input)
      : callShellOrpc((client) => client.shell.runtimeEnvironments.getStatus, input),
  call: (input) => requireWebEnvironmentApi().call(input),
  subscribe: (input, callbacks) => requireWebEnvironmentApi().subscribe(input, callbacks),
  callOrpcProcedure: (input, options) =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().callOrpcProcedure(input, options)
      : callShellOrpc((client) => client.shell.runtimeEnvironments.callOrpcProcedure, input, {
          signal: options?.signal,
          onBinary: options?.onBinary
        }),
  subscribeOrpcProcedure: (input, options) =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().subscribeOrpcProcedure(input, options)
      : callShellOrpc((client) => client.shell.runtimeEnvironments.subscribeOrpcProcedure, input, {
          signal: options?.signal
        })
}

function requireWebEnvironmentApi(): RuntimeEnvironmentApi {
  if (!isWebRuntimeClient()) {
    throw new Error('The legacy runtime environment gateway is unavailable in Electron.')
  }
  return getWebRuntimeEnvironmentApi()
}
