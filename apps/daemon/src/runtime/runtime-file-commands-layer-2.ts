import { randomUUID } from 'node:crypto'
import { open, stat } from 'node:fs/promises'
import { homedir } from 'node:os'

import type { RuntimeTerminalPathResolution } from '@yiru/runtime-protocol/mobile-runtime-types'
import { relativePathInsideRoot, resolveRuntimePath } from '@yiru/runtime-protocol/model/platform'

import { isENOENT, resolveAuthorizedPath } from '../filesystem/auth'
import { RuntimeFileCommandsLayer1 } from './runtime-file-commands-layer-1'
import type { RuntimeFileStatLike, TerminalFileGrant } from './runtime-file-foundation'
import { TERMINAL_FILE_GRANT_TTL_MS } from './runtime-file-foundation'
import { isSafeMobileRelativePath } from './runtime-file-paths'
import type { ResolvedRuntimeFileTarget } from './runtime-file-watcher-registry'
import {
  assertLocalTerminalArtifactPathStillCanonical,
  resolveTerminalAbsolutePath
} from './runtime-terminal-file-read'
import {
  terminalFileStatIdentity,
  assertTerminalArtifactNotHardLinked,
  isTerminalArtifactHardLinked
} from './runtime-terminal-file-security'
import {
  provenancePathCandidate,
  resolveAllowedLocalTerminalArtifactPath
} from './runtime-terminal-path'

export abstract class RuntimeFileCommandsLayer2 extends RuntimeFileCommandsLayer1 {
  // Resolves a path tapped in the mobile terminal (absolute, relative, or ~/…)
  // to a worktree-relative path the file RPCs can open, plus existence.
  // Relative paths resolve against `cwd` when the caller supplies it, else
  // against the worktree root.
  async resolveTerminalPath(
    worktreeSelector: string,
    pathText: string,
    cwd?: string | null,
    clientId?: string,
    terminalHandle?: string | null
  ): Promise<RuntimeTerminalPathResolution> {
    const store = this.host.requireStore()
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const { worktree } = target
    // Why: mobile may attach after OSC7 cwd metadata was emitted; the runtime
    // still owns the terminal's latest cwd and can resolve the tap correctly.
    const normalizedTerminalHandle =
      terminalHandle && terminalHandle.trim().length > 0 ? terminalHandle.trim() : null
    const terminalCwd = normalizedTerminalHandle
      ? await this.host.resolveTerminalCwd?.(normalizedTerminalHandle)
      : null
    const base = terminalCwd || (cwd && cwd.trim().length > 0 ? cwd : worktree.path)

    const empty: RuntimeTerminalPathResolution = {
      worktree: worktree.id,
      relativePath: null,
      absolutePath: null,
      exists: false,
      isDirectory: false
    }

    const isTilde = pathText.startsWith('~/') || pathText.startsWith('~\\')
    const expanded = isTilde ? resolveRuntimePath(homedir(), pathText.slice(2)) : pathText
    const absolutePath = resolveTerminalAbsolutePath({
      base,
      expanded,
      worktreePath: worktree.path
    })
    const relativePath = relativePathInsideRoot(worktree.path, absolutePath)

    try {
      if (relativePath !== null && relativePath !== '' && isSafeMobileRelativePath(relativePath)) {
        const stats = await stat(await resolveAuthorizedPath(absolutePath, store))
        return {
          worktree: worktree.id,
          relativePath,
          absolutePath,
          exists: true,
          isDirectory: stats.isDirectory(),
          openTarget: stats.isDirectory()
            ? undefined
            : {
                kind: 'worktree-file',
                provider: 'local',
                relativePath,
                absolutePath
              }
        }
      }

      // Why: mobile taps can point at agent-created artifacts outside the
      // worktree. Authorize and grant the exact existing path instead of
      // widening worktree-relative file RPCs to arbitrary absolute paths.
      if (!normalizedTerminalHandle || !terminalCwd) {
        return { ...empty, relativePath, absolutePath }
      }
      const terminalContext = this.host.resolveTerminalContext?.(normalizedTerminalHandle)
      if (!terminalContext || terminalContext.worktreeId !== worktree.id) {
        return { ...empty, relativePath, absolutePath }
      }
      const artifactPath = await this.resolveAllowedTerminalArtifactPath({
        absolutePath,
        worktreePath: worktree.path
      })
      if (!artifactPath) {
        return { ...empty, relativePath, absolutePath }
      }
      if (
        !(await this.host.hasRecentTerminalOutputPath?.(
          normalizedTerminalHandle,
          provenancePathCandidate(pathText, absolutePath),
          artifactPath
        ))
      ) {
        return { ...empty, relativePath, absolutePath }
      }
      const stats = await this.statLocalTerminalPath(artifactPath)
      const isDirectory = stats.isDirectory()
      if (!isDirectory && isTerminalArtifactHardLinked(stats)) {
        return { ...empty, relativePath, absolutePath }
      }
      const grant = isDirectory
        ? null
        : this.createTerminalFileGrant({
            worktreeId: worktree.id,
            absolutePath: artifactPath,
            provider: 'local',
            clientId,
            stats
          })
      return {
        worktree: worktree.id,
        relativePath: null,
        absolutePath: artifactPath,
        exists: true,
        isDirectory,
        openTarget: grant
          ? {
              kind: 'absolute-file',
              provider: grant.provider,
              absolutePath: artifactPath,
              grantId: grant.id
            }
          : undefined
      }
    } catch (error) {
      if (isENOENT(error)) {
        return { ...empty, relativePath, absolutePath }
      }
      throw error
    }
  }

  protected async resolveAllowedTerminalArtifactPath(args: {
    absolutePath: string
    worktreePath: string
  }): Promise<string | null> {
    return resolveAllowedLocalTerminalArtifactPath(args.absolutePath, args.worktreePath)
  }

  protected async statLocalTerminalPath(
    absolutePath: string
  ): Promise<RuntimeFileStatLike & { isDirectory: () => boolean }> {
    await assertLocalTerminalArtifactPathStillCanonical(absolutePath)
    const handle = await open(absolutePath, 'r')
    try {
      return handle.stat()
    } finally {
      await handle.close()
    }
  }

  protected createTerminalFileGrant(args: {
    worktreeId: string
    absolutePath: string
    provider: 'local'
    clientId?: string
    stats: RuntimeFileStatLike
  }): TerminalFileGrant {
    assertTerminalArtifactNotHardLinked(args.stats)
    const grant: TerminalFileGrant = {
      id: randomUUID(),
      worktreeId: args.worktreeId,
      absolutePath: args.absolutePath,
      provider: args.provider,
      ...(args.clientId ? { clientId: args.clientId } : {}),
      expiresAt: Date.now() + TERMINAL_FILE_GRANT_TTL_MS,
      statIdentity: terminalFileStatIdentity(args.stats)
    }
    this.terminalFileGrants.set(grant.id, grant)
    this.scheduleTerminalFileGrantExpiry(grant)
    return grant
  }

  protected async requireTerminalFileGrant(
    worktreeSelector: string,
    grantId: string,
    absolutePath: string,
    clientId?: string
  ): Promise<{ grant: TerminalFileGrant; target: ResolvedRuntimeFileTarget }> {
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    this.pruneExpiredTerminalFileGrants()
    const grant = this.terminalFileGrants.get(grantId)
    if (!grant) {
      throw new Error('terminal_file_grant_expired')
    }
    if (grant.expiresAt <= Date.now()) {
      this.releaseTerminalFileGrant(grantId, grant)
      throw new Error('terminal_file_grant_expired')
    }
    if (
      grant.worktreeId !== target.worktree.id ||
      grant.absolutePath !== absolutePath ||
      grant.clientId !== clientId
    ) {
      throw new Error('terminal_file_grant_mismatch')
    }
    return { grant, target }
  }

  protected refreshTerminalFileGrant(grant: TerminalFileGrant): void {
    grant.expiresAt = Date.now() + TERMINAL_FILE_GRANT_TTL_MS
    this.scheduleTerminalFileGrantExpiry(grant)
  }

  protected pruneExpiredTerminalFileGrants(): void {
    const now = Date.now()
    for (const [id, grant] of this.terminalFileGrants) {
      if (grant.expiresAt <= now) {
        this.releaseTerminalFileGrant(id, grant)
      }
    }
  }

  revokeTerminalFileGrantsForClient(clientId: string): void {
    for (const [id, grant] of this.terminalFileGrants) {
      if (grant.clientId === clientId) {
        this.releaseTerminalFileGrant(id, grant)
      }
    }
  }

  protected releaseTerminalFileGrant(id: string, grant: TerminalFileGrant): void {
    this.terminalFileGrants.delete(id)
    if (grant.expiryTimer) {
      clearTimeout(grant.expiryTimer)
      grant.expiryTimer = undefined
    }
  }

  protected scheduleTerminalFileGrantExpiry(grant: TerminalFileGrant): void {
    if (grant.expiryTimer) {
      clearTimeout(grant.expiryTimer)
    }
    grant.expiryTimer = setTimeout(
      () => {
        if (this.terminalFileGrants.get(grant.id) === grant && grant.expiresAt <= Date.now()) {
          this.releaseTerminalFileGrant(grant.id, grant)
        }
      },
      Math.max(1, grant.expiresAt - Date.now())
    )
    grant.expiryTimer.unref?.()
  }
}
