import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  ComputerActionResult,
  ComputerListAppsResult,
  ComputerListWindowsResult,
  ComputerProviderCapabilities,
  ComputerSnapshotResult
} from '@yiru/runtime-protocol/workbench/runtime-types'

import { normalizeComputerActionResult } from './action-verification-normalization'
import {
  actionCapabilityKey,
  bridgeTool,
  cacheParamsForActionResult,
  desktopActionMetadataFromResponse,
  desktopActionWindowTarget,
  elementParam,
  isWindowChangedAction,
  verifyDesktopAction
} from './platform-script-action'
import { execBridge, mapBridgeError } from './platform-script-provider-bridge'
import {
  optionalNumberParam,
  optionalStringParam,
  providerParams,
  stringParam
} from './platform-script-provider-params'
import {
  platformScriptPlatform,
  resolvePlatformScriptProviderPath,
  type PlatformScriptPlatform
} from './platform-script-provider-paths'
import type { BridgeRequest, BridgeResponse } from './platform-script-provider-types'
import { normalizeBridgeApp, renderSnapshot } from './platform-script-snapshot-rendering'
import { PlatformScriptSnapshotStore } from './platform-script-snapshot-store'
import {
  type ComputerProviderActionMethod,
  validateComputerProviderActionParams
} from './provider-action-validation'
import { RuntimeClientError } from './runtime-client-error'

export class PlatformScriptProviderClient {
  private readonly snapshotStore = new PlatformScriptSnapshotStore()
  private readonly platform: PlatformScriptPlatform
  private readonly scriptPath: string
  readonly snapshots = this.snapshotStore.snapshots
  private providerCapabilities: ComputerProviderCapabilities | null = null

  constructor(platform: PlatformScriptPlatform, scriptPath: string) {
    this.platform = platform
    this.scriptPath = scriptPath
  }

  static async create(): Promise<PlatformScriptProviderClient> {
    const platform = requiredPlatform()
    const scriptPath = await resolvePlatformScriptProviderPath(platform)
    if (!scriptPath) {
      throw new RuntimeClientError(
        'unsupported_capability',
        `computer-use has no script provider for ${process.platform}`
      )
    }
    return new PlatformScriptProviderClient(platform, scriptPath)
  }

  shutdown(): void {
    this.snapshotStore.clear()
    this.providerCapabilities = null
  }

  async listApps(): Promise<ComputerListAppsResult> {
    const response = await this.callBridge({ tool: 'list_apps' })
    return {
      apps: (response.apps ?? []).map((app) => ({
        name: app.name,
        bundleId: app.bundleId ?? app.bundleIdentifier ?? null,
        pid: app.pid,
        isRunning: true,
        lastUsedAt: null,
        useCount: null
      }))
    }
  }

  async capabilities(): Promise<ComputerProviderCapabilities> {
    return await this.readCapabilities()
  }

  async listWindows(value: unknown): Promise<ComputerListWindowsResult> {
    const params = providerParams(value)
    const capabilities = await this.readCapabilities()
    if (!capabilities.supports.windows.list) {
      throw new RuntimeClientError(
        'unsupported_capability',
        `${capabilities.provider} does not support windows.list`
      )
    }
    const response = await this.callBridge({
      tool: 'list_windows',
      app: stringParam(params, 'app')
    })
    return {
      app: normalizeBridgeApp(response.app),
      windows: (response.windows ?? []).map((window) => ({
        index: window.index,
        app: normalizeBridgeApp(window.app),
        id: window.id ?? null,
        title: window.title,
        x: window.x ?? null,
        y: window.y ?? null,
        width: window.width,
        height: window.height,
        isMinimized: window.isMinimized ?? null,
        isOffscreen: window.isOffscreen ?? null,
        screenIndex: window.screenIndex ?? null,
        platform: window.platform
      }))
    }
  }

  async snapshot(value: unknown): Promise<ComputerSnapshotResult> {
    const params = providerParams(value)
    const app = stringParam(params, 'app')
    const response = await this.callBridge({
      tool: 'get_app_state',
      app,
      windowId: optionalNumberParam(params, 'windowId'),
      windowIndex: optionalNumberParam(params, 'windowIndex'),
      noScreenshot: params.noScreenshot === true,
      restoreWindow: params.restoreWindow === true
    })
    return this.rememberAndRender(app, response, params.noScreenshot === true, params)
  }

  async action(
    method: ComputerProviderActionMethod,
    value: unknown
  ): Promise<ComputerActionResult> {
    const params = providerParams(value)
    const app = await validateComputerProviderActionParams(method, params)
    const explicitWindowId = optionalNumberParam(params, 'windowId')
    const explicitWindowIndex = optionalNumberParam(params, 'windowIndex')
    const current = this.snapshotStore.current(app, explicitWindowId, params)
    const actionWindowTarget = desktopActionWindowTarget(
      explicitWindowId,
      explicitWindowIndex,
      current
    )
    const element = elementParam(current, optionalNumberParam(params, 'elementIndex'))
    const fromElement = elementParam(current, optionalNumberParam(params, 'fromElementIndex'))
    const toElement = elementParam(current, optionalNumberParam(params, 'toElementIndex'))
    await this.ensureActionSupported(method)
    const response = await this.callBridge({
      tool: bridgeTool(method),
      app,
      element,
      fromElement,
      toElement,
      x: optionalNumberParam(params, 'x'),
      y: optionalNumberParam(params, 'y'),
      from_x: optionalNumberParam(params, 'fromX'),
      from_y: optionalNumberParam(params, 'fromY'),
      to_x: optionalNumberParam(params, 'toX'),
      to_y: optionalNumberParam(params, 'toY'),
      click_count: optionalNumberParam(params, 'clickCount'),
      mouse_button: optionalStringParam(params, 'mouseButton'),
      action: optionalStringParam(params, 'action'),
      direction: optionalStringParam(params, 'direction'),
      pages: optionalNumberParam(params, 'pages'),
      text: optionalStringParam(params, 'text'),
      key: optionalStringParam(params, 'key'),
      value: optionalStringParam(params, 'value'),
      windowBounds: null,
      ...actionWindowTarget,
      noScreenshot: params.noScreenshot === true,
      restoreWindow: params.restoreWindow === true
    })
    const action = verifyDesktopAction(
      desktopActionMetadataFromResponse(
        response.action,
        method,
        response.snapshot?.windowId ?? current?.windowId ?? null,
        response.snapshot?.windowIndex ?? current?.windowIndex ?? null
      ),
      method,
      params,
      response.action,
      response.snapshot,
      element
    )
    if (isWindowChangedAction(action)) {
      this.snapshotStore.forgetWindowTarget(app, params, current)
    }
    return normalizeComputerActionResult({
      ...this.rememberAndRender(
        app,
        response,
        params.noScreenshot === true,
        cacheParamsForActionResult(params, action)
      ),
      action
    })
  }

  private async ensureActionSupported(method: ComputerProviderActionMethod): Promise<void> {
    const capabilities = await this.readCapabilities()
    const actionKey = actionCapabilityKey(method)
    if (!capabilities.supports.actions[actionKey]) {
      throw new RuntimeClientError(
        'unsupported_capability',
        `${capabilities.provider} does not support actions.${actionKey}`
      )
    }
  }

  private async callBridge(request: BridgeRequest): Promise<BridgeResponse> {
    const operationDirectory = await mkdtemp(join(tmpdir(), 'yiru-computer-use-'))
    const operationPath = join(operationDirectory, 'operation.json')
    try {
      await writeFile(operationPath, JSON.stringify(request), { encoding: 'utf8', mode: 0o600 })
      const { stdout, stderr } = await execBridge(this.platform, this.scriptPath, operationPath)
      let response: BridgeResponse
      try {
        response = JSON.parse(stdout) as BridgeResponse
      } catch (error) {
        throw new RuntimeClientError(
          'accessibility_error',
          `platform script provider returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      if (!response.ok) {
        throw mapBridgeError(response.error ?? stderr)
      }
      return response
    } finally {
      await rm(operationDirectory, { force: true, recursive: true })
    }
  }

  private async readCapabilities(): Promise<ComputerProviderCapabilities> {
    if (this.providerCapabilities) {
      return this.providerCapabilities
    }
    const response = await this.callBridge({ tool: 'handshake' })
    if (!response.capabilities) {
      throw new RuntimeClientError(
        'accessibility_error',
        'platform script provider returned no capabilities'
      )
    }
    this.providerCapabilities = response.capabilities
    return response.capabilities
  }

  private rememberAndRender(
    app: string,
    response: BridgeResponse,
    noScreenshot: boolean,
    params: Record<string, unknown>
  ): ComputerSnapshotResult {
    if (!response.snapshot) {
      throw new RuntimeClientError(
        'accessibility_error',
        'platform script provider returned no snapshot'
      )
    }
    this.snapshotStore.remember(app, response.snapshot, params)
    return renderSnapshot(response.snapshot, noScreenshot)
  }
}

function requiredPlatform(): PlatformScriptPlatform {
  const platform = platformScriptPlatform()
  if (!platform) {
    throw new RuntimeClientError(
      'unsupported_capability',
      'platform script provider is not available'
    )
  }
  return platform
}
