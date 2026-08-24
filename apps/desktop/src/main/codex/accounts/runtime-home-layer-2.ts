import { existsSync, chmodSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getSystemCodexHomePath } from '../home-paths'
import { writeFileAtomically } from './atomic-file-operations'
import type { CodexRuntimeLogoutMarkerStatus } from './runtime-home-foundation'
import { CodexRuntimeHomeLayer1 } from './runtime-home-layer-1'

export abstract class CodexRuntimeHomeLayer2 extends CodexRuntimeHomeLayer1 {
  protected syncRuntimeAuthWithSystemDefault(): void {
    const runtimeAuthPath = this.getRuntimeAuthPath()
    const systemDefaultAuthPath = join(getSystemCodexHomePath(), 'auth.json')
    if (!existsSync(runtimeAuthPath)) {
      return
    }

    try {
      const runtimeAuth = readFileSync(runtimeAuthPath, 'utf-8')
      if (!existsSync(systemDefaultAuthPath)) {
        const snapshot = this.readSystemDefaultSnapshot(this.getSystemDefaultSnapshotPath())
        const mirroredSystemDefaultAuth = this.lastWrittenAuthJson ?? snapshot?.authJson ?? null
        if (mirroredSystemDefaultAuth !== null && runtimeAuth === mirroredSystemDefaultAuth) {
          this.clearRuntimeAuthAfterSystemDefaultLogout(runtimeAuthPath)
          return
        }
        if (
          mirroredSystemDefaultAuth !== null &&
          this.runtimeAuthMatchesSystemDefaultIdentity(runtimeAuth, mirroredSystemDefaultAuth)
        ) {
          this.clearRuntimeAuthAfterSystemDefaultLogout(runtimeAuthPath)
        }
        return
      }
      const systemDefaultAuth = readFileSync(systemDefaultAuthPath, 'utf-8')
      if (runtimeAuth !== systemDefaultAuth) {
        const snapshot = this.readSystemDefaultSnapshot(this.getSystemDefaultSnapshotPath())
        const mirroredSystemDefaultAuth = this.lastWrittenAuthJson ?? snapshot?.authJson ?? null
        if (
          mirroredSystemDefaultAuth !== null &&
          systemDefaultAuth === mirroredSystemDefaultAuth &&
          this.runtimeAuthMatchesSystemDefaultIdentity(runtimeAuth, mirroredSystemDefaultAuth)
        ) {
          // Why: system-default Codex now refreshes tokens inside Yiru's
          // runtime CODEX_HOME. Read that refresh back to ~/.codex so the next
          // sync does not overwrite fresh runtime credentials with stale ones.
          this.writeSystemDefaultAuth(runtimeAuth)
          this.captureSystemDefaultSnapshot({ force: true })
          this.lastWrittenAuthJson = runtimeAuth
          return
        }
        // Why: the unmanaged path used to read ~/.codex directly. Mirror later
        // external logins/logouts into Yiru's runtime home so ordinary Yiru
        // Codex sessions keep matching the user's current system-default state.
        this.captureSystemDefaultSnapshot({ force: true })
        this.writeRuntimeAuth(systemDefaultAuth)
      }
    } catch (error) {
      console.warn('[codex-runtime-home] Failed to sync system-default auth:', error)
    }
  }

  protected restoreSystemDefaultSnapshot(options: { detectExternalLogin: boolean }): void {
    const snapshotPath = this.getSystemDefaultSnapshotPath()
    const runtimeAuthPath = this.getRuntimeAuthPath()
    const systemDefaultAuthPath = join(getSystemCodexHomePath(), 'auth.json')
    if (existsSync(systemDefaultAuthPath)) {
      const systemDefaultAuth = readFileSync(systemDefaultAuthPath, 'utf-8')
      this.captureSystemDefaultSnapshot({ force: true })
      this.writeRuntimeAuth(systemDefaultAuth)
      return
    }

    if (options.detectExternalLogin && !existsSync(runtimeAuthPath)) {
      // Why: once Yiru owns the runtime CODEX_HOME, deleting auth.json there is
      // a local logout signal for Yiru-launched Codex sessions, not a reason to
      // rewrite the user's real ~/.codex snapshot back into place.
      this.persistRuntimeLogoutMarker()
      this.lastWrittenAuthJson = null
      return
    }

    if (options.detectExternalLogin) {
      // Why: while a managed account is selected, the runtime auth file exists
      // with managed credentials. If ~/.codex/auth.json vanished meanwhile,
      // switching back must preserve that external system-default logout.
      rmSync(runtimeAuthPath, { force: true })
      this.captureSystemDefaultSnapshot({ force: true })
      this.persistRuntimeLogoutMarker()
      this.lastWrittenAuthJson = null
      return
    }

    if (!existsSync(snapshotPath)) {
      this.captureSystemDefaultSnapshot({ force: true })
    }

    const snapshot = this.readSystemDefaultSnapshot(snapshotPath)
    if (!snapshot) {
      console.warn('[codex-runtime-home] Ignoring invalid system-default auth snapshot')
      rmSync(snapshotPath, { force: true })
      this.captureSystemDefaultSnapshot({ force: true })
      const refreshedSnapshot = this.readSystemDefaultSnapshot(snapshotPath)
      if (!refreshedSnapshot) {
        rmSync(runtimeAuthPath, { force: true })
        this.lastWrittenAuthJson = null
        return
      }
      if (refreshedSnapshot.authJson === null) {
        rmSync(runtimeAuthPath, { force: true })
        this.lastWrittenAuthJson = null
        return
      }
      this.writeRuntimeAuth(refreshedSnapshot.authJson)
      return
    }
    if (snapshot.authJson === null) {
      rmSync(runtimeAuthPath, { force: true })
      this.lastWrittenAuthJson = null
      return
    }
    this.writeRuntimeAuth(snapshot.authJson)
  }

  protected writeSystemDefaultAuth(contents: string): void {
    const systemDefaultAuthPath = join(getSystemCodexHomePath(), 'auth.json')
    mkdirSync(dirname(systemDefaultAuthPath), { recursive: true })
    writeFileAtomically(systemDefaultAuthPath, contents, { mode: 0o600 })
    this.ensureOwnerOnlyMode(systemDefaultAuthPath)
  }

  protected clearRuntimeAuthAfterSystemDefaultLogout(runtimeAuthPath: string): void {
    // Why: when the real ~/.codex auth disappears, Yiru should treat that as an
    // external logout for unmanaged sessions, even if runtime auth had already
    // refreshed inside Yiru's CODEX_HOME.
    rmSync(runtimeAuthPath, { force: true })
    this.captureSystemDefaultSnapshot({ force: true })
    this.persistRuntimeLogoutMarker()
    this.lastWrittenAuthJson = null
  }

  protected readSystemDefaultAuth(): string | null {
    const systemDefaultAuthPath = join(getSystemCodexHomePath(), 'auth.json')
    return existsSync(systemDefaultAuthPath) ? readFileSync(systemDefaultAuthPath, 'utf-8') : null
  }

  protected writeRuntimeAuth(contents: string): void {
    // Why: auth.json contains sensitive credentials. Restrict to owner-only
    // so other users on a shared Linux/macOS machine cannot read it.
    this.clearRuntimeLogoutMarker()
    if (this.fileContentsEqual(this.getRuntimeAuthPath(), contents)) {
      this.ensureOwnerOnlyMode(this.getRuntimeAuthPath())
      this.lastWrittenAuthJson = contents
      return
    }
    writeFileAtomically(this.getRuntimeAuthPath(), contents, { mode: 0o600 })
    this.lastWrittenAuthJson = contents
  }

  protected writeRuntimeAuthAtPath(authPath: string, contents: string): void {
    if (this.fileContentsEqual(authPath, contents)) {
      this.ensureOwnerOnlyMode(authPath)
      return
    }
    mkdirSync(dirname(authPath), { recursive: true })
    writeFileAtomically(authPath, contents, { mode: 0o600 })
  }

  protected fileContentsEqual(targetPath: string, contents: string): boolean {
    try {
      return existsSync(targetPath) && readFileSync(targetPath, 'utf-8') === contents
    } catch {
      return false
    }
  }

  protected ensureOwnerOnlyMode(targetPath: string): void {
    if (process.platform === 'win32') {
      return
    }
    try {
      chmodSync(targetPath, 0o600)
    } catch {
      /* Best effort: the next atomic write will set the restrictive mode. */
    }
  }

  protected getRuntimeLogoutMarkerStatus(): CodexRuntimeLogoutMarkerStatus {
    const marker = this.readRuntimeLogoutMarker()
    if (!marker) {
      return { kind: 'missing' }
    }
    const systemDefaultAuthJson = this.readSystemDefaultAuth()
    if (systemDefaultAuthJson === marker.systemDefaultAuthJson) {
      return { kind: 'applies' }
    }
    this.clearRuntimeLogoutMarker()
    return { kind: 'system-default-changed', systemDefaultAuthJson }
  }
}
