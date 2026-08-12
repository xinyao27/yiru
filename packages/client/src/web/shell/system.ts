import type { ShellNotificationsApi } from '~renderer/runtime/shell-notifications-client'
import type {
  ShellAppApi,
  ShellGitHubApi,
  ShellRepoHostApi,
  ShellRuntimeStateApi,
  ShellStarNagApi,
  ShellUpdaterApi
} from '~renderer/runtime/shell-system-client'

import { webShellAppApi } from './app'
import { createWebShellGitHubApi } from './github'
import { createWebShellNotificationsApi } from './notifications'
import { createWebShellRepoHostApi } from './repo-host'
import { createWebShellRuntimeApi } from './runtime'
import { webShellStarNagApi } from './star-nag'
import { createWebShellUpdaterApi } from './updater'

export function getWebShellSystemApis(): {
  app: ShellAppApi
  repoHost: ShellRepoHostApi
  runtime: ShellRuntimeStateApi
  gh: ShellGitHubApi
  notifications: ShellNotificationsApi
  starNag: ShellStarNagApi
  updater: ShellUpdaterApi
} {
  return {
    app: webShellAppApi,
    repoHost: createWebShellRepoHostApi(),
    runtime: createWebShellRuntimeApi(),
    gh: createWebShellGitHubApi(),
    notifications: createWebShellNotificationsApi(),
    starNag: webShellStarNagApi,
    updater: createWebShellUpdaterApi()
  }
}
