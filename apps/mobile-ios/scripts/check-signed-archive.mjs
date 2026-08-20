#!/usr/bin/env node

// Why: TestFlight accepts an archive whose signing is subtly wrong — a development
// aps-environment, an unsigned widget, a mismatched app group — and the failure only
// surfaces as "push notifications don't work" or "widget is blank" after real testers
// install it. This gate reads the exact archive fastlane is about to upload.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const APP_BUNDLE_ID = 'com.xinyao27.yiru.mobile'
const WIDGET_BUNDLE_ID = 'com.xinyao27.yiru.mobile.ExpoWidgetsTarget'
const APP_GROUP = 'group.com.xinyao27.yiru.mobile'
const TEAM_ID = '8H6Q2YA365'
const EXPECTED_SIGNING_AUTHORITY = 'Apple Distribution'
const EXPECTED_APS_ENVIRONMENT = 'production'

const failures = []
const notes = []

function fail(message) {
  failures.push(message)
}

function readPlist(path) {
  const json = execFileSync('plutil', ['-convert', 'json', '-o', '-', path], {
    encoding: 'utf8'
  })
  return JSON.parse(json)
}

// Why: `codesign -d --entitlements -` emits an XML plist on stdout; converting through
// a temp-free plutil pipe keeps the check read-only against the archive.
function readEntitlements(bundlePath) {
  const xml = execFileSync('codesign', ['-d', '--entitlements', ':-', '--xml', bundlePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  })
  const json = execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], {
    encoding: 'utf8',
    input: xml
  })
  return JSON.parse(json)
}

function verifySignatureValid(label, bundlePath) {
  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', bundlePath], {
      stdio: ['ignore', 'ignore', 'pipe']
    })
  } catch (error) {
    const detail = error.stderr ? String(error.stderr).trim() : error.message
    fail(`${label}: signature does not verify — ${detail}`)
    return false
  }
  return true
}

function verifyAuthorityAndTeam(label, bundlePath) {
  // Why: codesign writes display metadata to stderr even when it exits successfully.
  // Capture both streams so a valid distribution signature is not reported as empty.
  const result = spawnSync('codesign', ['-dvvv', bundlePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const report = [result.stdout, result.stderr].filter(Boolean).map(String).join('\n')
  if (result.error) {
    fail(`${label}: could not inspect signing authority — ${result.error.message}`)
    return
  }
  if (result.status !== 0) {
    fail(
      `${label}: could not inspect signing authority — ${report.trim() || `codesign exited ${result.status}`}`
    )
    return
  }
  if (!report.includes(EXPECTED_SIGNING_AUTHORITY)) {
    const authority = report.split('\n').find((line) => line.startsWith('Authority='))
    fail(
      `${label}: expected an "${EXPECTED_SIGNING_AUTHORITY}" authority, got ${authority ?? 'none'}`
    )
  }
  if (!report.includes(`TeamIdentifier=${TEAM_ID}`)) {
    const team = report.split('\n').find((line) => line.startsWith('TeamIdentifier='))
    fail(`${label}: expected TeamIdentifier=${TEAM_ID}, got ${team ?? 'none'}`)
  }
}

function verifyAppGroup(label, entitlements) {
  const groups = entitlements['com.apple.security.application-groups']
  if (!Array.isArray(groups) || !groups.includes(APP_GROUP)) {
    fail(
      `${label}: app group ${APP_GROUP} missing from entitlements (got ${JSON.stringify(groups ?? null)})`
    )
  }
}

const archivePath = process.argv[2]
if (!archivePath) {
  console.error('usage: check-signed-archive.mjs <path to Yiru.xcarchive>')
  process.exit(2)
}
if (!existsSync(archivePath)) {
  console.error(`archive not found: ${archivePath}`)
  process.exit(2)
}

const appPath = join(archivePath, 'Products', 'Applications', 'Yiru.app')
if (!existsSync(appPath)) {
  console.error(`archive has no Yiru.app at ${appPath}`)
  process.exit(2)
}
const widgetPath = join(appPath, 'PlugIns', 'YiruWidgets.appex')

// --- app ---
const appInfo = readPlist(join(appPath, 'Info.plist'))
if (appInfo.CFBundleIdentifier !== APP_BUNDLE_ID) {
  fail(`app: bundle id is ${appInfo.CFBundleIdentifier}, expected ${APP_BUNDLE_ID}`)
}
const marketingVersion = appInfo.CFBundleShortVersionString
const buildNumber = appInfo.CFBundleVersion
if (!marketingVersion) {
  fail('app: CFBundleShortVersionString is empty')
}
if (!buildNumber) {
  fail('app: CFBundleVersion is empty')
}

if (verifySignatureValid('app', appPath)) {
  verifyAuthorityAndTeam('app', appPath)
  const appEntitlements = readEntitlements(appPath)
  const aps = appEntitlements['aps-environment']
  if (aps !== EXPECTED_APS_ENVIRONMENT) {
    fail(
      `app: aps-environment is ${JSON.stringify(aps ?? null)}, expected "${EXPECTED_APS_ENVIRONMENT}" — a development APS token silently breaks push for TestFlight testers`
    )
  }
  verifyAppGroup('app', appEntitlements)
  const signedAppId = appEntitlements['application-identifier']
  if (signedAppId && signedAppId !== `${TEAM_ID}.${APP_BUNDLE_ID}`) {
    fail(`app: signed application-identifier is ${signedAppId}`)
  }
}

// --- widget ---
if (!existsSync(widgetPath)) {
  fail(`widget: no YiruWidgets.appex embedded at ${widgetPath}`)
} else {
  const widgetInfo = readPlist(join(widgetPath, 'Info.plist'))
  if (widgetInfo.CFBundleIdentifier !== WIDGET_BUNDLE_ID) {
    fail(`widget: bundle id is ${widgetInfo.CFBundleIdentifier}, expected ${WIDGET_BUNDLE_ID}`)
  }
  if (widgetInfo.CFBundleVersion !== buildNumber) {
    fail(
      `widget: CFBundleVersion ${widgetInfo.CFBundleVersion} does not match the app's ${buildNumber} — App Store Connect rejects mismatched build numbers`
    )
  }
  if (verifySignatureValid('widget', widgetPath)) {
    verifyAuthorityAndTeam('widget', widgetPath)
    verifyAppGroup('widget', readEntitlements(widgetPath))
  }
}

// --- archive metadata ---
const archiveInfoPath = join(archivePath, 'Info.plist')
if (existsSync(archiveInfoPath)) {
  const archiveInfo = readPlist(archiveInfoPath)
  const properties = archiveInfo.ApplicationProperties ?? {}
  if (
    properties.SigningIdentity &&
    !properties.SigningIdentity.includes(EXPECTED_SIGNING_AUTHORITY)
  ) {
    fail(`archive: SigningIdentity is "${properties.SigningIdentity}"`)
  }
  notes.push(`archive signing identity: ${properties.SigningIdentity ?? 'unreported'}`)
}

console.log(`Yiru.app ${marketingVersion ?? '?'} (${buildNumber ?? '?'})`)
for (const note of notes) {
  console.log(`  ${note}`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} signing problem(s) found:`)
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exit(1)
}

console.log('  signature, team, entitlements, app group, and widget embedding all verified')
