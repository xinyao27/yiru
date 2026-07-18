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
  stdio: 'inherit'
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
