import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

export type ServeSimRuntimeMaterializerOptions = {
  bundledPackageDir: string
  targetRootDir: string
  version: string
  clearQuarantine?: (dir: string) => void
}

const CAMERA_DYLIB_RELATIVE_PATH = join('dist', 'simcam', 'libSimCameraInjector.dylib')
const EXECUTABLE_RELATIVE_PATHS = [
  join('bin', 'serve-sim-bin'),
  join('dist', 'simcam', 'serve-sim-camera-helper')
]

function defaultClearQuarantine(dir: string): void {
  if (process.platform !== 'darwin') {
    return
  }
  // Why: bundle files carry com.apple.quarantine after download/update and
  // cpSync can clone xattrs; a quarantined camera dylib injected into a
  // simulator process is what syspolicyd malware-rejects.
  execFileSync('/usr/bin/xattr', ['-cr', dir], { timeout: 30_000 })
}

function pruneStaleServeSimRuntimes(targetRootDir: string, keepVersion: string): void {
  let entries: string[]
  try {
    entries = readdirSync(targetRootDir)
  } catch {
    return
  }
  for (const entryName of entries) {
    if (entryName === keepVersion) {
      continue
    }
    try {
      rmSync(join(targetRootDir, entryName), { recursive: true, force: true })
    } catch {
      // Old-version cleanup is best-effort; a locked file must not block materialization.
    }
  }
}

// Copies the bundled serve-sim package to a per-version directory outside the
// signed app bundle, restores the gzipped camera dylib, and strips quarantine.
// Why: the bundle cannot ship the raw dylib (iOS-simulator platform, never
// notarizable), and serve-sim resolves camera assets relative to its own
// entry, so the whole package must run from the materialized copy.
export function materializeServeSimRuntime(
  options: ServeSimRuntimeMaterializerOptions
): string | null {
  const { bundledPackageDir, targetRootDir, version } = options
  const clearQuarantine = options.clearQuarantine ?? defaultClearQuarantine
  const targetDir = join(targetRootDir, version)
  const entryPath = join(targetDir, 'dist', 'serve-sim.js')
  if (existsSync(entryPath)) {
    return targetDir
  }
  const stagingDir = join(targetRootDir, `.staging-${version}-${process.pid}`)
  try {
    mkdirSync(targetRootDir, { recursive: true })
    pruneStaleServeSimRuntimes(targetRootDir, version)
    rmSync(stagingDir, { recursive: true, force: true })
    rmSync(targetDir, { recursive: true, force: true })
    cpSync(bundledPackageDir, stagingDir, { recursive: true })
    const gzippedDylibPath = join(stagingDir, `${CAMERA_DYLIB_RELATIVE_PATH}.gz`)
    if (existsSync(gzippedDylibPath)) {
      writeFileSync(
        join(stagingDir, CAMERA_DYLIB_RELATIVE_PATH),
        gunzipSync(readFileSync(gzippedDylibPath)),
        { mode: 0o755 }
      )
      rmSync(gzippedDylibPath)
    }
    for (const relativePath of EXECUTABLE_RELATIVE_PATHS) {
      const executablePath = join(stagingDir, relativePath)
      if (existsSync(executablePath)) {
        chmodSync(executablePath, 0o755)
      }
    }
    clearQuarantine(stagingDir)
    try {
      renameSync(stagingDir, targetDir)
    } catch (error) {
      // Another app instance sharing userData may have finished first.
      if (!existsSync(entryPath)) {
        throw error
      }
    }
    return existsSync(entryPath) ? targetDir : null
  } catch {
    return null
  } finally {
    rmSync(stagingDir, { recursive: true, force: true })
  }
}
