import { isGitBashAvailable } from '~main/git-bash'
import { isPwshAvailable } from '~main/pwsh'
import { isWslAvailable, listWslDistros } from '~main/wsl'

import { defineMethod, type RpcMethod } from '../core'

export const HOST_CAPABILITY_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'host.platform',
    mobile: true,
    params: null,
    access: { scope: 'host', tier: 'read' },
    handler: async () => ({ platform: process.platform })
  }),
  defineMethod({
    name: 'host.wsl.isAvailable',
    mobile: true,
    params: null,
    access: { scope: 'host', tier: 'read' },
    handler: async () => isWslAvailable()
  }),
  defineMethod({
    name: 'host.wsl.listDistros',
    mobile: true,
    params: null,
    access: { scope: 'host', tier: 'read' },
    handler: async () => listWslDistros()
  }),
  defineMethod({
    name: 'host.pwsh.isAvailable',
    mobile: true,
    params: null,
    access: { scope: 'host', tier: 'read' },
    handler: async () => isPwshAvailable()
  }),
  defineMethod({
    name: 'host.gitBash.isAvailable',
    mobile: true,
    params: null,
    access: { scope: 'host', tier: 'read' },
    handler: async () => isGitBashAvailable()
  })
]
