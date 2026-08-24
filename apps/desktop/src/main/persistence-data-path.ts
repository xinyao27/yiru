import { mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { join, isAbsolute, resolve } from 'node:path'

import { isWindowsAbsolutePathLike } from '@yiru/workbench-model/platform'
import { isWslUncPath } from '@yiru/workbench-model/platform'
import { getRepoExecutionHostId } from '@yiru/workbench-model/workspace'
import { LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import { FOLDER_WORKSPACE_INSTANCE_SEPARATOR } from '@yiru/workbench-model/workspace'
import { hardenExistingSecureFile } from '~shared/secure-file'
import type { PersistedState } from '~shared/types'
import { worktreeWorkspaceKey } from '~shared/workspace/scope'

import { getRuntimeHostPathsProvider } from './runtime/host/paths-provider'
import { MOBILE_PAIRING_USERDATA_FILES } from './runtime/mobile-pairing-files'

// Why: the data-file path must not be a module-level constant. Module-level
// code runs at import time — before configureDevUserDataPath() redirects the
// userData path in index.ts — so a constant would capture the default (non-dev)
// path, causing dev and production instances to share the same file and silently
// overwrite each other.
//
// It also must not be resolved lazily on every call, because app.setName('Yiru')
// runs before the Store constructor and would change the resolved path from
// lowercase 'yiru' to uppercase 'Yiru'. On case-sensitive filesystems (Linux)
// this would look in the wrong directory and lose existing user data.
//
// Solution: index.ts calls initDataPath() right after configureDevUserDataPath()
// but before app.setName(), capturing the correct path at the right moment.
export let _dataFile: string | null = null
export let _userDataDir: string | null = null

export function initDataPath(userDataDir = getRuntimeHostPathsProvider().userDataPath()): void {
  _userDataDir = userDataDir
  _dataFile = join(userDataDir, 'yiru-data.json')
}

export function getDataFile(): string {
  if (!_dataFile) {
    // Safety fallback — should not be hit in normal startup.
    const userDataDir = getRuntimeHostPathsProvider().userDataPath()
    _userDataDir = userDataDir
    _dataFile = join(userDataDir, 'yiru-data.json')
  }
  return _dataFile
}

// Why: worktrees deleted outside Yiru (git CLI worktree remove, rm -rf,
// agent scripts) purge renderer session state but nothing removed their
// worktreeMeta, so the map grew monotonically (63% dead entries measured on
// a heavy install). GC is deliberately narrow: local-host entries only
// (SSH/runtime metas embed remote paths a local existsSync would falsely
// condemn; WSL UNC paths are skipped the same way), and only after a
// 30-day idle grace so pushTarget cleanup for recently-vanished worktrees
// and quick recreations keep their metadata.
export const WORKTREE_META_GC_GRACE_MS = 30 * 24 * 60 * 60 * 1000

export function gcStaleWorktreeMeta(state: PersistedState): number {
  // Why: a hand-corrupted file with `"worktreeMeta": null` overrides the
  // defaults merge; normalize instead of throwing outside the parse guard.
  state.worktreeMeta ??= {}
  const repoById = new Map(state.repos.map((repo) => [repo.id, repo]))
  const projectIds = new Set((state.projects ?? []).map((project) => project.id))
  const now = Date.now()
  let removed = 0
  for (const key of Object.keys(state.worktreeMeta)) {
    // Why: folder-project workspace instances are keyed
    // `repoId::path::workspace:<uuid>` and their meta IS the workspace
    // record — never a filesystem-checkout row. Skip them entirely.
    if (key.includes(FOLDER_WORKSPACE_INSTANCE_SEPARATOR)) {
      continue
    }
    const separator = key.indexOf('::')
    if (separator === -1) {
      continue
    }
    const ownerId = key.slice(0, separator)
    const worktreePath = key.slice(separator + 2)
    const meta = state.worktreeMeta[key]
    const repo = repoById.get(ownerId)
    if (repo) {
      if (repo.connectionId || getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
        continue
      }
    } else if (projectIds.has(ownerId)) {
      // Project-owned metas keep project/host semantics on the entry itself;
      // stay conservative and leave them to their own lifecycle.
      continue
    }
    // Unowned entries (repo removed before removeProject pruned metas) fall
    // through to the same missing-path + idle-grace gate.
    if (meta?.hostId && meta.hostId !== LOCAL_EXECUTION_HOST_ID) {
      continue
    }
    if (!isAbsolute(worktreePath) || isWslUncPath(worktreePath)) {
      continue
    }
    // Why: WSL linked worktrees on Windows carry Linux-style paths from git
    // porcelain; a Windows existsSync cannot probe those and would falsely
    // condemn live worktrees.
    if (process.platform === 'win32' && !isWindowsAbsolutePathLike(worktreePath)) {
      continue
    }
    // Why keep timestamp-less entries: without lastActivityAt/createdAt we
    // cannot prove the 30-day idle grace elapsed; the measured dead entries
    // all carry timestamps, so this costs almost nothing in reclaimed bytes.
    // Grace runs before the stat so healthy profiles skip the existsSync
    // fan-out (and its slow-NFS tail) for active entries entirely.
    const newestTouch = Math.max(meta?.lastActivityAt ?? 0, meta?.createdAt ?? 0)
    if (newestTouch === 0 || now - newestTouch < WORKTREE_META_GC_GRACE_MS) {
      continue
    }
    if (existsSync(worktreePath)) {
      continue
    }
    delete state.worktreeMeta[key]
    delete state.worktreeLineageById[key]
    delete state.workspaceLineageByChildKey[worktreeWorkspaceKey(key)]
    removed++
  }
  return removed
}

/**
 * Return the userData directory captured at initDataPath() time, before
 * app.setName() can change how app.getPath('userData') resolves.
 *
 * Subsystems that must share storage with yiru-data.json (mobile pairing's
 * DeviceRegistry, E2EE keypair, runtime metadata) read this instead of
 * resolving the path late, which on case-sensitive filesystems can land in a
 * different directory and lose paired devices across restarts/updates.
 */
export function getCanonicalUserDataPath(): string {
  if (!_userDataDir) {
    // Safety fallback — should not be hit in normal startup.
    _userDataDir = getRuntimeHostPathsProvider().userDataPath()
  }
  return _userDataDir
}

/**
 * Copy legacy mobile pairing credentials into the canonical userData directory.
 *
 * Existing installs may already have credentials in the late app.getPath('userData')
 * directory. Before switching the runtime host to the canonical path, copy the
 * registry and E2EE keypair forward as a pair so an update does not force one
 * last re-pair or mix devices with the wrong key.
 */
export function migrateMobilePairingDataToCanonicalUserDataPath(sourceUserDataDir: string): void {
  const targetUserDataDir = getCanonicalUserDataPath()
  if (resolve(sourceUserDataDir) === resolve(targetUserDataDir)) {
    return
  }

  const migrations = MOBILE_PAIRING_USERDATA_FILES.map((fileName) => ({
    sourcePath: join(sourceUserDataDir, fileName),
    targetPath: join(targetUserDataDir, fileName)
  }))
  if (migrations.some(({ sourcePath }) => !existsSync(sourcePath))) {
    return
  }
  if (migrations.some(({ targetPath }) => existsSync(targetPath))) {
    return
  }

  mkdirSync(targetUserDataDir, { recursive: true })
  for (const { sourcePath, targetPath } of migrations) {
    copyFileSync(sourcePath, targetPath)
    // Why: these are credential files (device tokens, E2EE secret key). copyFileSync
    // does not carry Windows ACLs, so re-assert the current-user-only restriction on
    // the copy instead of relying on the runtime's later lazy re-harden on read.
    hardenExistingSecureFile(targetPath)
  }
}
