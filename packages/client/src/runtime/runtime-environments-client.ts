import { getWebRuntimeEnvironmentApi } from '../web/preload-api'
import { callShellOrpc, isWebRuntimeClient } from './orpc-client'
import type { RuntimeEnvironmentApi } from './runtime-environment-api'

export const runtimeEnvironmentsClient: RuntimeEnvironmentApi = {
  list: async () =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().list()
      : restoreEnvironmentDocument(
          await callShellOrpc((client) => client.shell.runtimeEnvironments.list, undefined)
        ),
  resolve: async (input) =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().resolve(input)
      : restoreEnvironmentDocument(
          await callShellOrpc((client) => client.shell.runtimeEnvironments.resolve, input)
        ),
  remove: async (input) =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().remove(input)
      : restoreEnvironmentDocument(
          await callShellOrpc((client) => client.shell.runtimeEnvironments.remove, input)
        ),
  disconnect: async (input) =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().disconnect(input)
      : restoreEnvironmentDocument(
          await callShellOrpc((client) => client.shell.runtimeEnvironments.disconnect, input)
        ),
  getStatus: async (input) =>
    isWebRuntimeClient()
      ? getWebRuntimeEnvironmentApi().getStatus(input)
      : restoreEnvironmentDocument(
          await callShellOrpc((client) => client.shell.runtimeEnvironments.getStatus, input)
        ),
  call: (input) => requireWebEnvironmentApi().call(input),
  subscribe: (input, callbacks) => requireWebEnvironmentApi().subscribe(input, callbacks),
  callOrpcProcedure: (input, options) =>
    requireWebEnvironmentApi().callOrpcProcedure(input, options)
}

function requireWebEnvironmentApi(): RuntimeEnvironmentApi {
  if (!isWebRuntimeClient()) {
    throw new Error('The legacy runtime environment gateway is unavailable in Electron.')
  }
  return getWebRuntimeEnvironmentApi()
}

function restoreEnvironmentDocument<TResult>(value: unknown): TResult {
  return value as TResult
}
