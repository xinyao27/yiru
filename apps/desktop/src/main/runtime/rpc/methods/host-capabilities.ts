import { isGitBashAvailable } from '../../../git-bash'
import { isPwshAvailable } from '../../../pwsh'
import { isWslAvailable, listWslDistros } from '../../../wsl'
import { defineMethod, type RpcMethod } from '../core'

export const HOST_CAPABILITY_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'host.platform',
    mobile: true,
    params: null,
    handler: async () => ({ platform: process.platform })
  }),
  defineMethod({
    name: 'host.wsl.isAvailable',
    mobile: true,
    params: null,
    handler: async () => isWslAvailable()
  }),
  defineMethod({
    name: 'host.wsl.listDistros',
    mobile: true,
    params: null,
    handler: async () => listWslDistros()
  }),
  defineMethod({
    name: 'host.pwsh.isAvailable',
    mobile: true,
    params: null,
    handler: async () => isPwshAvailable()
  }),
  defineMethod({
    name: 'host.gitBash.isAvailable',
    mobile: true,
    params: null,
    handler: async () => isGitBashAvailable()
  })
]
