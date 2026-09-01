import { callShellOrpc } from './orpc-client'
import type { RuntimeEnvironmentApi } from './runtime-environment-api'

export const runtimeEnvironmentsClient: RuntimeEnvironmentApi = {
  list: () => callShellOrpc((client) => client.shell.runtimeEnvironments.list, undefined),
  resolve: (input) => callShellOrpc((client) => client.shell.runtimeEnvironments.resolve, input),
  remove: (input) => callShellOrpc((client) => client.shell.runtimeEnvironments.remove, input),
  disconnect: (input) =>
    callShellOrpc((client) => client.shell.runtimeEnvironments.disconnect, input),
  getStatus: (input) =>
    callShellOrpc((client) => client.shell.runtimeEnvironments.getStatus, input),
  callOrpcProcedure: (input, options) =>
    callShellOrpc((client) => client.shell.runtimeEnvironments.callOrpcProcedure, input, {
      signal: options?.signal,
      onBinary: options?.onBinary
    }),
  subscribeOrpcProcedure: (input, options) =>
    callShellOrpc((client) => client.shell.runtimeEnvironments.subscribeOrpcProcedure, input, {
      signal: options?.signal
    })
}
