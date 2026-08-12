import { getDefaultCreateProjectParent } from '~renderer/components/sidebar/create-project-defaults'
import { translate } from '~renderer/i18n/i18n'
import type { ShellRepoHostApi } from '~renderer/runtime/shell-system-client'

import { callWebRuntimeProcedure } from '../runtime-connection'

export function createWebShellRepoHostApi(): ShellRepoHostApi {
  return {
    pickFolder: () => Promise.resolve(null),
    pickFolders: () => Promise.resolve([]),
    pickDirectory: () => Promise.resolve(null),
    removeForHost: () => {
      throw new Error(
        translate('auto.web.web.shell.repoHostUnavailable', 'Unavailable in the web client.')
      )
    },
    reorderForHost: async () => {
      throw new Error(
        translate('auto.web.web.shell.repoHostUnavailable', 'Unavailable in the web client.')
      )
    },
    cloneAbort: () => Promise.resolve(),
    getDefaultCreateProjectParent: async () => {
      const result = await callWebRuntimeProcedure((client, options) =>
        client.files.browseServerDir({ path: '~' }, options)
      )
      return getDefaultCreateProjectParent(result.resolvedPath)
    }
  }
}
