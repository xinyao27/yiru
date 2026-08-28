// Why: compile hardening disables ambient bunfig, dotenv, package, and tsconfig autoloads.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildSkillResources } from '../../../scripts/build-skill-resources.mjs'

const PACKAGE_ROOT = join(import.meta.dirname, '..')
const outputDirectory = join(PACKAGE_ROOT, 'dist')
const computerScriptArtifacts = [
  join(PACKAGE_ROOT, 'native', 'computer-use-linux', 'runtime.py'),
  join(PACKAGE_ROOT, 'native', 'computer-use-windows', 'runtime.ps1')
]
const releaseTargets = [
  'bun-darwin-arm64',
  'bun-darwin-x64',
  'bun-linux-arm64',
  'bun-linux-arm64-musl',
  'bun-linux-x64',
  'bun-linux-x64-musl',
  'bun-windows-x64'
]

mkdirSync(outputDirectory, { recursive: true })

const targets = process.argv.includes('--all') ? releaseTargets : [null]
const generatedResourceDirectory = mkdtempSync(join(tmpdir(), 'yiru-skill-resources-'))
const BUILD_IDENTITY =
  process.env.YIRU_BUILD_IDENTITY === 'stable' || process.env.YIRU_BUILD_IDENTITY === 'rc'
    ? JSON.stringify(process.env.YIRU_BUILD_IDENTITY)
    : 'null'
const POSTHOG_WRITE_KEY = process.env.YIRU_POSTHOG_WRITE_KEY?.trim()
  ? JSON.stringify(process.env.YIRU_POSTHOG_WRITE_KEY.trim())
  : 'null'

try {
  const skillBundleArtifacts = await buildSkillResources(generatedResourceDirectory)
  for (const target of targets) {
    const isWindows = target?.startsWith('bun-windows-') ?? process.platform === 'win32'
    const executableName = target
      ? `yiru-${target}${isWindows ? '.exe' : ''}`
      : isWindows
        ? 'yiru.exe'
        : 'yiru'
    const compile = {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadPackageJson: false,
      autoloadTsconfig: false,
      assets: [...skillBundleArtifacts, ...computerScriptArtifacts],
      outfile: join(outputDirectory, executableName),
      ...(target ? { target } : {})
    }
    const result = await Bun.build({
      entrypoints: [join(PACKAGE_ROOT, 'src', 'entry.ts')],
      compile,
      tsconfig: join(PACKAGE_ROOT, 'tsconfig.json'),
      define: {
        'process.env.YIRU_APP_VERSION': JSON.stringify(process.env.npm_package_version ?? '0.0.36'),
        'process.env.YIRU_BUILD_IDENTITY': BUILD_IDENTITY,
        'process.env.YIRU_POSTHOG_WRITE_KEY': POSTHOG_WRITE_KEY
      },
      minify: true,
      naming: { asset: '[name].[ext]' },
      sourcemap: 'linked',
      target: 'bun'
    })
    if (!result.success) {
      for (const log of result.logs) {
        console.error(log)
      }
      process.exitCode = 1
      break
    }
  }
} finally {
  rmSync(generatedResourceDirectory, { recursive: true, force: true })
}
