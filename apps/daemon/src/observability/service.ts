import { arch, platform, release } from 'node:os'

import type { DiagnosticsStatus } from '@yiru/runtime-protocol/workbench/support-report'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { collectBundle, type CollectedDiagnosticBundle } from './bundle'
import { createLocalFileSink, traceFamilySize, type LocalFileSink } from './local-file-sink'
import { getTraceFilePath } from './logs'
import { setActiveSink } from './tracer'

const CI_ENV_VARS = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'TRAVIS',
  'BUILDKITE',
  'JENKINS_URL',
  'TEAMCITY_VERSION'
] as const

let sink: LocalFileSink | null = null

export function initializeObservability(): void {
  const status = resolveDiagnosticsStatus()
  if (!status.localFileEnabled || sink) {
    return
  }
  sink = createLocalFileSink(status.traceFilePath)
  setActiveSink(sink)
}

export function shutdownObservability(): void {
  setActiveSink(null)
  sink?.close()
  sink = null
}

export function getDiagnosticsStatus(): DiagnosticsStatus {
  const status = resolveDiagnosticsStatus()
  return {
    ...status,
    traceFamilySize: status.localFileEnabled ? traceFamilySize(status.traceFilePath) : 0
  }
}

export async function collectDiagnosticBundle(
  lookbackMinutes?: number
): Promise<CollectedDiagnosticBundle> {
  sink?.flush()
  const status = getDiagnosticsStatus()
  if (!status.bundleEnabled) {
    throw new Error('creating review files is disabled')
  }
  return collectBundle({
    traceFilePath: status.traceFilePath,
    appVersion: getRuntimeHostPathsProvider().version(),
    platform: platform(),
    arch: arch(),
    osRelease: release(),
    yiruChannel: resolveDiagnosticChannel(),
    ...(lookbackMinutes === undefined ? {} : { lookbackMinutes })
  })
}

function resolveDiagnosticsStatus(): Omit<DiagnosticsStatus, 'traceFamilySize'> {
  const traceFilePath = getTraceFilePath()
  if (CI_ENV_VARS.some((name) => Boolean(process.env[name]))) {
    return { localFileEnabled: false, bundleEnabled: false, traceFilePath, disabledReason: 'ci' }
  }
  if (envEnabled('YIRU_DIAGNOSTICS_DISABLED')) {
    return {
      localFileEnabled: false,
      bundleEnabled: false,
      traceFilePath,
      disabledReason: 'yiru_diagnostics_disabled'
    }
  }
  if (envEnabled('DO_NOT_TRACK')) {
    return {
      localFileEnabled: true,
      bundleEnabled: false,
      traceFilePath,
      disabledReason: 'do_not_track'
    }
  }
  if (envEnabled('YIRU_TELEMETRY_DISABLED')) {
    return {
      localFileEnabled: true,
      bundleEnabled: false,
      traceFilePath,
      disabledReason: 'yiru_telemetry_disabled'
    }
  }
  return { localFileEnabled: true, bundleEnabled: true, traceFilePath }
}

function envEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  return value === '1' || value === 'true'
}

function resolveDiagnosticChannel(): 'stable' | 'rc' | 'dev' {
  const identity = process.env.YIRU_BUILD_IDENTITY
  return identity === 'stable' || identity === 'rc' ? identity : 'dev'
}
