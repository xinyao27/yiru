import { spawnSync } from 'node:child_process'

const [profile, ...lintArguments] = process.argv.slice(2)
const supportedProfiles = new Set(['react-doctor', 'switch-exhaustiveness'])

if (!profile || !supportedProfiles.has(profile)) {
  throw new Error(`Unsupported Vite+ lint profile: ${profile ?? '(missing)'}`)
}

const vitePlus = process.platform === 'win32' ? 'vp.cmd' : 'vp'
// Why: Vite+ does not accept alternate config paths; selecting the profile
// through the child environment keeps specialized passes in vite.config.ts.
const result = spawnSync(vitePlus, ['lint', ...lintArguments], {
  env: { ...process.env, YIRU_LINT_PROFILE: profile },
  stdio: ['inherit', 'pipe', 'pipe'],
  encoding: 'utf8'
})

if (result.error) {
  throw result.error
}

if (result.stdout) {
  process.stdout.write(result.stdout)
}
if (result.stderr) {
  process.stderr.write(result.stderr)
}

// Why: `vp staged` passes every staged file to this profile pass, but profiles
// ignore paths outside their scope (e.g. apps/mobile/** under react-doctor).
// A mobile-only commit then leaves zero files to lint, which Vite+ reports as
// an error; out-of-scope staged files are not a lint failure.
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
if (result.status !== 0 && output.includes('No files found to lint')) {
  process.exit(0)
}

process.exit(result.status ?? 1)
