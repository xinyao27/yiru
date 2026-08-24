import { app } from 'electron'

import { recordCrashBreadcrumb } from '../crash-reporting/crash-breadcrumb-store'
import {
  DEFAULT_GPU_CRASH_FALLBACK_THRESHOLD,
  DEFAULT_GPU_CRASH_FALLBACK_WINDOW_MS,
  GpuCrashFallbackTracker
} from '../crash-reporting/gpu-crash-fallback-decision'
import {
  readActiveGpuFallbackMarker,
  writeGpuFallbackMarker,
  type GpuFallbackEnvironment,
  type WindowsGpuFallbackEnvironment
} from './gpu-fallback-marker'

export class GpuCrashRecovery {
  readonly #launchTimeMs = Date.now()
  readonly #tracker = new GpuCrashFallbackTracker({
    windowMs: DEFAULT_GPU_CRASH_FALLBACK_WINDOW_MS,
    threshold: DEFAULT_GPU_CRASH_FALLBACK_THRESHOLD
  })
  readonly #isServeMode: boolean
  readonly #isAppQuitting: () => boolean
  readonly #onQuit: () => void
  #fallbackActive = false

  constructor(options: { isServeMode: boolean; isAppQuitting: () => boolean; onQuit: () => void }) {
    this.#isServeMode = options.isServeMode
    this.#isAppQuitting = options.isAppQuitting
    this.#onQuit = options.onQuit
  }

  isFallbackActive(): boolean {
    return this.#fallbackActive
  }

  applyForLaunch(): void {
    if (this.#isServeMode || process.platform !== 'win32') {
      return
    }
    const marker = readActiveGpuFallbackMarker(app.getPath('userData'), this.#getEnvironment())
    if (!marker) {
      return
    }
    app.disableHardwareAcceleration()
    app.commandLine.appendSwitch('disable-gpu')
    this.#fallbackActive = true
    recordCrashBreadcrumb('gpu_fallback_applied', {
      crashesInWindow: marker.crashesInWindow
    })
  }

  handleChildCrash(reason: string, exitCode: number | null): void {
    if (this.#fallbackActive || this.#isAppQuitting() || this.#isServeMode) {
      return
    }
    const result = this.#tracker.recordGpuCrash(Date.now() - this.#launchTimeMs)
    if (!result.shouldEngageFallback) {
      return
    }
    recordCrashBreadcrumb('gpu_fallback_engaged', {
      reason,
      exitCode,
      crashesInWindow: result.crashesInWindow
    })
    const environment = this.#getWindowsEnvironment()
    if (!environment) {
      return
    }
    try {
      writeGpuFallbackMarker(
        app.getPath('userData'),
        { engagedAt: Date.now(), crashesInWindow: result.crashesInWindow },
        environment
      )
    } catch (error) {
      console.warn('[gpu-fallback] failed to persist marker:', error)
      return
    }
    this.#onQuit()
    app.relaunch()
    app.exit(0)
  }

  #getEnvironment(): GpuFallbackEnvironment {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? '',
      platform: process.platform
    }
  }

  #getWindowsEnvironment(): WindowsGpuFallbackEnvironment | null {
    const environment = this.#getEnvironment()
    return environment.platform === 'win32' ? { ...environment, platform: 'win32' } : null
  }
}
