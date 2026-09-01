import { isLazy, isProcedure, type AnyRouter, type Lazyable } from '@orpc/server'

type RouterBranch = Record<string, Lazyable<AnyRouter>>

export function mergeWorkbenchRouters(legacyRouter: AnyRouter, daemonRouter: AnyRouter): AnyRouter {
  const legacy = requireRouterBranch(legacyRouter, 'legacy')
  const daemon = requireRouterBranch(daemonRouter, 'daemon')
  const legacyHost = requireChildBranch(legacy, 'host')
  const daemonHost = requireChildBranch(daemon, 'host')
  const legacyMobile = requireChildBranch(legacy, 'mobile')
  const daemonMobile = requireChildBranch(daemon, 'mobile')
  const daemonBrowser = requireChildBranch(daemon, 'browser')
  const legacyNotifications = requireChildBranch(legacy, 'notifications')
  const daemonNotifications = requireChildBranch(daemon, 'notifications')
  const legacyRepo = requireChildBranch(legacy, 'repo')
  const daemonRepo = requireChildBranch(daemon, 'repo')
  const legacyTerminal = requireChildBranch(legacy, 'terminal')
  const daemonTerminal = requireChildBranch(daemon, 'terminal')
  const legacyWorktree = requireChildBranch(legacy, 'worktree')
  const daemonWorktree = requireChildBranch(daemon, 'worktree')

  // Why: the restored workbench remains authoritative for every overlapping Desktop workflow.
  // Only leaves introduced for the extension are selected from the new daemon router.
  return {
    ...daemon,
    ...legacy,
    browser: daemonBrowser,
    host: { ...legacyHost, ...daemonHost },
    mobile: { ...legacyMobile, ...daemonMobile },
    notifications: {
      ...legacyNotifications,
      registerPush: requireChild(daemonNotifications, 'registerPush')
    },
    repo: {
      ...daemonRepo,
      ...legacyRepo,
      browse: requireChild(daemonRepo, 'browse'),
      discover: requireChild(daemonRepo, 'discover')
    },
    terminal: {
      ...daemonTerminal,
      ...legacyTerminal,
      approve: requireChild(daemonTerminal, 'approve')
    },
    worktree: {
      ...daemonWorktree,
      ...legacyWorktree,
      archive: requireChild(daemonWorktree, 'archive'),
      listArchives: requireChild(daemonWorktree, 'listArchives'),
      restoreArchive: requireChild(daemonWorktree, 'restoreArchive')
    }
  }
}

function requireChildBranch(parent: RouterBranch, key: string): RouterBranch {
  return requireRouterBranch(requireChild(parent, key), key)
}

function requireChild(parent: RouterBranch, key: string): AnyRouter {
  const child = parent[key]
  if (!child) {
    throw new Error(`workbench_router_branch_missing:${key}`)
  }
  if (isLazy(child)) {
    throw new Error(`workbench_router_lazy_branch_unsupported:${key}`)
  }
  return child
}

function requireRouterBranch(value: AnyRouter, name: string): RouterBranch {
  if (isProcedure(value) || typeof value !== 'object' || value === null) {
    throw new Error(`workbench_router_branch_invalid:${name}`)
  }
  return value
}
