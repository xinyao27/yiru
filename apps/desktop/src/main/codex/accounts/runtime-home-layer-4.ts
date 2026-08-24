import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  renameSync,
  rmdirSync,
  symlinkSync,
  unlinkSync
} from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { getRuntimeHostPathsProvider } from '~main/runtime/host/paths-provider'

import { getYiruManagedCodexHomePath, getSystemCodexHomePath } from '../home-paths'
import { isCodexSystemDefaultRealHomeEnabled } from '../real-home-flag'
import { migrateLegacySharedAuthToPerAccountHome } from './legacy-shared-auth-migration'
import { CodexRuntimeHomeLayer3 } from './runtime-home-layer-3'
import { normalizeCodexRuntimeSelection } from './runtime-selection'

export abstract class CodexRuntimeHomeLayer4 extends CodexRuntimeHomeLayer3 {
  protected safeMigrateLegacySharedAuth(): void {
    const settings = this.store.getSettings()
    if (!isCodexSystemDefaultRealHomeEnabled()) {
      return
    }
    try {
      migrateLegacySharedAuthToPerAccountHome({
        activeHostAccountId: normalizeCodexRuntimeSelection(settings).host,
        hostAccounts: settings.codexManagedAccounts.filter(
          (account) => !this.getWslManagedHomePath(account)
        ),
        managedAccountsRoot: this.getManagedAccountsRoot(),
        metadataDir: this.getRuntimeMetadataDir(),
        sharedRuntimeHome: this.getRuntimeHomePath(),
        systemCodexHome: getSystemCodexHomePath()
      })
    } catch (error) {
      // Why: leave the marker absent after an inconclusive result so a later
      // startup can retry without risking cross-account credential movement.
      console.warn('[codex-runtime-home] Failed to migrate legacy shared Codex auth:', error)
    }
  }

  protected safeMigrateLegacyManagedState(): void {
    try {
      this.migrateLegacyManagedStateIfNeeded()
    } catch (error) {
      console.warn('[codex-runtime-home] Failed to migrate legacy managed Codex state:', error)
    }
  }

  protected safeMigrateLegacyActiveHomePointer(): void {
    try {
      const activeHomePath = this.getLegacyHostActiveHomePath()
      if (!this.legacyActiveHomePathExists(activeHomePath)) {
        return
      }
      this.repointLegacyActiveHomePointer(activeHomePath, this.getRuntimeHomePath())
    } catch (error) {
      console.warn('[codex-runtime-home] Failed to migrate legacy active Codex home:', error)
    }
  }

  protected getRuntimeHomePath(): string {
    return getYiruManagedCodexHomePath()
  }

  protected getRuntimeAuthPath(): string {
    return join(this.getRuntimeHomePath(), 'auth.json')
  }

  protected getSystemDefaultSnapshotPath(): string {
    return join(this.getRuntimeMetadataDir(), 'system-default-auth.json')
  }

  protected getRuntimeLogoutMarkerPath(): string {
    return join(this.getRuntimeMetadataDir(), 'system-default-runtime-logout.json')
  }

  protected getRuntimeMetadataDir(): string {
    const metadataDir = join(getRuntimeHostPathsProvider().userDataPath(), 'codex-runtime-home')
    mkdirSync(metadataDir, { recursive: true })
    return metadataDir
  }

  protected getLegacyHostActiveHomePath(): string {
    return join(this.getRuntimeMetadataDir(), 'active', 'host', 'home')
  }

  protected getMigrationMarkerPath(): string {
    return join(this.getRuntimeMetadataDir(), 'migration-v1.json')
  }

  protected getMigrationDiagnosticsPath(): string {
    return join(this.getRuntimeMetadataDir(), 'migration-diagnostics.jsonl')
  }

  protected getManagedAccountsRoot(): string {
    return join(getRuntimeHostPathsProvider().userDataPath(), 'codex-accounts')
  }

  protected repointLegacyActiveHomePointer(activeHomePath: string, runtimeHomePath: string): void {
    if (this.activeHomeAlreadyPointsToRuntimeHome(activeHomePath, runtimeHomePath)) {
      return
    }
    if (!this.legacyActiveHomeLinkIsReplaceable(activeHomePath)) {
      return
    }

    mkdirSync(runtimeHomePath, { recursive: true })
    mkdirSync(dirname(activeHomePath), { recursive: true })
    const nextLinkPath = `${activeHomePath}.next-${process.pid}-${Date.now()}`
    this.removeLegacyActiveHomeLinkIfOwned(nextLinkPath)
    try {
      symlinkSync(
        runtimeHomePath,
        nextLinkPath,
        process.platform === 'win32' && lstatSync(runtimeHomePath).isDirectory()
          ? 'junction'
          : undefined
      )
      try {
        renameSync(nextLinkPath, activeHomePath)
      } catch (error) {
        if (!this.legacyActiveHomeLinkIsReplaceable(activeHomePath)) {
          throw error
        }
        this.removeLegacyActiveHomeLinkIfOwned(activeHomePath)
        renameSync(nextLinkPath, activeHomePath)
      }
    } finally {
      this.removeLegacyActiveHomeLinkIfOwned(nextLinkPath)
    }
  }

  protected activeHomeAlreadyPointsToRuntimeHome(
    activeHomePath: string,
    runtimeHomePath: string
  ): boolean {
    try {
      return this.linkTargetsMatch(readlinkSync(activeHomePath), activeHomePath, runtimeHomePath)
    } catch {
      return false
    }
  }

  protected linkTargetsMatch(
    linkTarget: string,
    linkPath: string,
    expectedTargetPath: string
  ): boolean {
    const resolvedLinkTarget = isAbsolute(linkTarget)
      ? resolve(linkTarget)
      : resolve(dirname(linkPath), linkTarget)
    return resolvedLinkTarget === resolve(expectedTargetPath)
  }

  protected legacyActiveHomeLinkIsReplaceable(activeHomePath: string): boolean {
    try {
      const stat = lstatSync(activeHomePath)
      return stat.isSymbolicLink() || this.isWindowsReadableLink(activeHomePath)
    } catch {
      return true
    }
  }

  protected legacyActiveHomePathExists(activeHomePath: string): boolean {
    try {
      lstatSync(activeHomePath)
      return true
    } catch {
      return false
    }
  }

  protected removeLegacyActiveHomeLinkIfOwned(activeHomePath: string): void {
    try {
      const stat = lstatSync(activeHomePath)
      if (stat.isSymbolicLink()) {
        unlinkSync(activeHomePath)
      } else if (this.isWindowsReadableLink(activeHomePath)) {
        rmdirSync(activeHomePath)
      }
    } catch {
      // Missing or inaccessible temporary links are handled by the caller.
    }
  }

  protected isWindowsReadableLink(targetPath: string): boolean {
    if (process.platform !== 'win32') {
      return false
    }
    try {
      readlinkSync(targetPath)
      return true
    } catch {
      return false
    }
  }
}
