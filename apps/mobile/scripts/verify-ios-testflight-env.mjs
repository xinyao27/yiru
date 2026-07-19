#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

export const REQUIRED_IOS_TESTFLIGHT_ENV_NAMES = [
  'APPLE_TEAM_ID',
  'ASC_KEY_ID',
  'ASC_ISSUER_ID',
  'ASC_API_KEY_P8',
  'IOS_DIST_CERT_P12',
  'IOS_DIST_CERT_PASSWORD'
]

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function getMissingIosTestflightEnvNames(env = process.env) {
  return REQUIRED_IOS_TESTFLIGHT_ENV_NAMES.filter((name) => !hasValue(env[name]))
}

function main() {
  const missing = getMissingIosTestflightEnvNames()
  if (missing.length > 0) {
    throw new Error(`Missing iOS TestFlight credentials: ${missing.join(', ')}`)
  }
  console.log('iOS TestFlight credentials are configured')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
