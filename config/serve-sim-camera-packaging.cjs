const { existsSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { gzipSync } = require('node:zlib')

// Why: libSimCameraInjector.dylib targets the iOS-simulator platform, which
// Apple's notary service never tickets for arm64 — a raw copy anywhere in the
// bundle is permanently rejected by Gatekeeper assessment. Shipping it gzipped
// makes it plain data (unsigned, unassessed); the app materializes a
// quarantine-free copy at runtime before serve-sim injects it.
function compressMacServeSimCameraDylibs(resourcesDir, electronPlatformName) {
  if (electronPlatformName !== 'darwin') {
    return
  }
  const packageDirs = [
    join(resourcesDir, 'serve-sim'),
    join(resourcesDir, 'node_modules', 'serve-sim')
  ].filter((packageDir) => existsSync(packageDir))
  if (packageDirs.length === 0) {
    throw new Error(`No packaged serve-sim copies found under ${resourcesDir}`)
  }
  for (const packageDir of packageDirs) {
    const dylibPath = join(packageDir, 'dist', 'simcam', 'libSimCameraInjector.dylib')
    if (!existsSync(dylibPath)) {
      throw new Error(`Expected serve-sim camera dylib missing: ${dylibPath}`)
    }
    writeFileSync(`${dylibPath}.gz`, gzipSync(readFileSync(dylibPath)))
    rmSync(dylibPath)
    // Why: with the prebuilt dylib gone, serve-sim's build-from-source fallback
    // would compile into the sealed bundle and break its signature. Without
    // Sources the fallback fails with serve-sim's own reinstall error instead.
    rmSync(join(packageDir, 'Sources'), { recursive: true, force: true })
  }
}

module.exports = { compressMacServeSimCameraDylibs }
