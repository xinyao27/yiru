import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { compressMacServeSimCameraDylibs } = require('../serve-sim-camera-packaging.cjs')

const DYLIB_CONTENT = Buffer.from('fake-ios-simulator-dylib')

async function createServeSimPackage(packageDir, { withSources = true } = {}) {
  await mkdir(join(packageDir, 'dist', 'simcam'), { recursive: true })
  await writeFile(join(packageDir, 'dist', 'simcam', 'libSimCameraInjector.dylib'), DYLIB_CONTENT)
  await writeFile(join(packageDir, 'dist', 'simcam', 'serve-sim-camera-helper'), 'helper')
  if (withSources) {
    await mkdir(join(packageDir, 'Sources', 'SimCameraInjector'), { recursive: true })
    await writeFile(join(packageDir, 'Sources', 'SimCameraInjector', 'build.sh'), 'echo build')
  }
}

describe('compressMacServeSimCameraDylibs', () => {
  const cleanupPaths = []

  afterEach(async () => {
    for (const path of cleanupPaths.splice(0)) {
      await rm(path, { recursive: true, force: true })
    }
  })

  async function createResourcesDir() {
    const resourcesDir = await mkdtemp(join(tmpdir(), 'orca-simcam-packaging-'))
    cleanupPaths.push(resourcesDir)
    return resourcesDir
  }

  it('replaces raw dylibs with gzip payloads in both packaged copies', async () => {
    const resourcesDir = await createResourcesDir()
    await createServeSimPackage(join(resourcesDir, 'serve-sim'))
    await createServeSimPackage(join(resourcesDir, 'node_modules', 'serve-sim'))

    compressMacServeSimCameraDylibs(resourcesDir, 'darwin')

    for (const packageDir of ['serve-sim', join('node_modules', 'serve-sim')]) {
      const dylibPath = join(
        resourcesDir,
        packageDir,
        'dist',
        'simcam',
        'libSimCameraInjector.dylib'
      )
      await expect(stat(dylibPath)).rejects.toThrow()
      expect(gunzipSync(await readFile(`${dylibPath}.gz`))).toEqual(DYLIB_CONTENT)
      const helperPath = join(resourcesDir, packageDir, 'dist', 'simcam', 'serve-sim-camera-helper')
      expect(await readFile(helperPath, 'utf8')).toBe('helper')
    }
  })

  it('removes Sources so the build-from-source fallback cannot write into the sealed bundle', async () => {
    const resourcesDir = await createResourcesDir()
    await createServeSimPackage(join(resourcesDir, 'serve-sim'))

    compressMacServeSimCameraDylibs(resourcesDir, 'darwin')

    await expect(stat(join(resourcesDir, 'serve-sim', 'Sources'))).rejects.toThrow()
  })

  it('throws when a packaged copy is missing its dylib', async () => {
    const resourcesDir = await createResourcesDir()
    await createServeSimPackage(join(resourcesDir, 'serve-sim'))
    await rm(join(resourcesDir, 'serve-sim', 'dist', 'simcam', 'libSimCameraInjector.dylib'))

    expect(() => compressMacServeSimCameraDylibs(resourcesDir, 'darwin')).toThrow(
      /camera dylib missing/
    )
  })

  it('throws when no packaged serve-sim copy exists on darwin', async () => {
    const resourcesDir = await createResourcesDir()

    expect(() => compressMacServeSimCameraDylibs(resourcesDir, 'darwin')).toThrow(
      /No packaged serve-sim copies/
    )
  })

  it('leaves non-darwin packaging untouched', async () => {
    const resourcesDir = await createResourcesDir()
    await createServeSimPackage(join(resourcesDir, 'serve-sim'))

    compressMacServeSimCameraDylibs(resourcesDir, 'win32')
    compressMacServeSimCameraDylibs(resourcesDir, 'linux')

    const dylibPath = join(
      resourcesDir,
      'serve-sim',
      'dist',
      'simcam',
      'libSimCameraInjector.dylib'
    )
    expect(await readFile(dylibPath)).toEqual(DYLIB_CONTENT)
    await expect(stat(join(resourcesDir, 'serve-sim', 'Sources'))).resolves.toBeDefined()
  })
})
