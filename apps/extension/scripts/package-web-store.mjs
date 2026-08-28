// Why: Web Store submission needs a deterministic root-level ZIP plus a checksum and structural
// review gate; the ordinary WXT build intentionally emits only an unpacked extension directory.
import { mkdirSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs'
import { join, relative } from 'node:path'

const packageRoot = join(import.meta.dirname, '..')
const distRoot = join(packageRoot, '.output', 'chrome-mv3')
const releaseRoot = join(packageRoot, 'release')
const packageJson = await Bun.file(join(packageRoot, 'package.json')).json()
const manifest = await Bun.file(join(distRoot, 'manifest.json')).json()

if (manifest.manifest_version !== 3 || manifest.version !== packageJson.version) {
  throw new Error('web_store_manifest_version_mismatch')
}
for (const required of [
  'background.js',
  'icons/icon-128.png',
  'managed-storage-schema.json',
  'manifest.json',
  'side-panel.html'
]) {
  if (!(await Bun.file(join(distRoot, required)).exists())) {
    throw new Error(`web_store_required_file_missing:${required}`)
  }
}

const files = listFiles(distRoot)
if (
  files.some((path) => /(?:^|\/)(?:\.env|\.git|node_modules)(?:\/|$)|\.(?:map|pem)$/.test(path))
) {
  throw new Error('web_store_forbidden_file_present')
}

const stableTime = new Date('2026-01-01T00:00:00.000Z')
for (const path of files) {
  utimesSync(join(distRoot, path), stableTime, stableTime)
}
mkdirSync(releaseRoot, { recursive: true })
const archiveName = `yiru-extension-${packageJson.version}.zip`
const archivePath = join(releaseRoot, archiveName)
rmSync(archivePath, { force: true })

const zip = Bun.spawnSync(['zip', '-X', '-q', archivePath, ...files], {
  cwd: distRoot,
  stderr: 'pipe',
  stdout: 'pipe'
})
if (zip.exitCode !== 0) {
  throw new Error(`web_store_zip_failed:${zip.stderr.toString().trim()}`)
}
const digest = new Bun.CryptoHasher('sha256')
  .update(await Bun.file(archivePath).bytes())
  .digest('hex')
await Bun.write(join(releaseRoot, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`)
console.log(JSON.stringify({ archivePath, digest, files: files.length }))

function listFiles(root) {
  const pending = [root]
  const files = []
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const name of readdirSync(directory).sort()) {
      const absolutePath = join(directory, name)
      if (statSync(absolutePath).isDirectory()) {
        pending.push(absolutePath)
      } else {
        files.push(relative(root, absolutePath).replaceAll('\\', '/'))
      }
    }
  }
  return files.sort()
}
