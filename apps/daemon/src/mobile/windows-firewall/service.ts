import { win32 } from 'node:path'

import type {
  WindowsMobileFirewallRepairResult,
  WindowsMobileFirewallStatus,
  WindowsNetworkCategory
} from '@yiru/runtime-protocol/workbench/windows-mobile-firewall'

import { hasSufficientWindowsFirewallRemoteScope } from './remote-scope'

const FIREWALL_RULE_NAME = 'Yiru.MobilePairing'
const FIREWALL_RULE_DISPLAY_NAME = 'Yiru Mobile Pairing'
const POWERSHELL_TIMEOUT_MS = 10_000
const ELEVATION_TIMEOUT_MS = 5 * 60_000

type PowerShellRunner = (script: string, timeoutMs: number) => Promise<string>

type WindowsMobileFirewallEnvironment = {
  platform: NodeJS.Platform
  isInstalledRelease: boolean
  executablePath: string
  systemRoot?: string
  runPowerShell?: PowerShellRunner
}

export function createWindowsMobileFirewallService(readEndpoint: () => string | null) {
  const environment = defaultEnvironment()
  return {
    inspect: (address?: string) =>
      inspectWindowsMobileFirewall(readMobilePort(readEndpoint()), address, environment),
    repair: () => repairWindowsMobileFirewall(readMobilePort(readEndpoint()), environment),
    openNetworkSettings: () => openWindowsNetworkSettings(environment.platform)
  }
}

async function inspectWindowsMobileFirewall(
  port: number | null,
  address: string | undefined,
  environment: WindowsMobileFirewallEnvironment
): Promise<WindowsMobileFirewallStatus> {
  if (!isSupported(environment, port)) {
    return { supported: false }
  }
  try {
    const stdout = await getRunner(environment)(
      buildInspectionScript(port, environment.executablePath, address),
      POWERSHELL_TIMEOUT_MS
    )
    const result: unknown = JSON.parse(stdout.trim())
    if (!isRecord(result)) {
      throw new Error('windows_firewall_inspection_invalid')
    }
    const blockingRuleDetected = result.blockingRuleDetected === true
    return {
      supported: true,
      port,
      ruleAllowed:
        !blockingRuleDetected &&
        hasSufficientWindowsFirewallRemoteScope(
          result.matchingRuleScopes,
          result.localAddress,
          result.localPrefixLength
        ),
      blockingRuleDetected,
      privateFirewallEnabled: result.privateFirewallEnabled !== false,
      networkCategory: parseNetworkCategory(result.networkCategory),
      inspectionAvailable: true
    }
  } catch {
    // Why: inspection is advisory; unavailable PowerShell or managed policy must not block pairing.
    return unavailableStatus(port)
  }
}

async function repairWindowsMobileFirewall(
  port: number | null,
  environment: WindowsMobileFirewallEnvironment
): Promise<WindowsMobileFirewallRepairResult> {
  if (!isSupported(environment, port)) {
    return { ok: false, reason: 'unsupported' }
  }
  const powershellPath = getWindowsPowerShellPath(environment.systemRoot)
  const repairScript = buildRepairScript(port, environment.executablePath)
  const elevationScript = buildElevationScript(powershellPath, encodePowerShell(repairScript))
  try {
    const stdout = await getRunner(environment)(elevationScript, ELEVATION_TIMEOUT_MS)
    const result: unknown = JSON.parse(stdout.trim())
    if (!isRecord(result)) {
      return { ok: false, reason: 'failed' }
    }
    if (result.launched !== true && result.nativeErrorCode === 1223) {
      return { ok: false, reason: 'cancelled' }
    }
    return result.launched === true && result.exitCode === 0
      ? { ok: true }
      : { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

function defaultEnvironment(): WindowsMobileFirewallEnvironment {
  return {
    platform: process.platform,
    // Why: only signed release artifacts have a stable path worth persisting in an elevated rule.
    isInstalledRelease:
      process.env.YIRU_BUILD_IDENTITY === 'stable' || process.env.YIRU_BUILD_IDENTITY === 'rc',
    executablePath: process.execPath,
    systemRoot: process.env.SystemRoot
  }
}

function isSupported(
  environment: WindowsMobileFirewallEnvironment,
  port: number | null
): port is number {
  return environment.platform === 'win32' && environment.isInstalledRelease && port !== null
}

function unavailableStatus(port: number): WindowsMobileFirewallStatus {
  return {
    supported: true,
    port,
    ruleAllowed: false,
    blockingRuleDetected: false,
    privateFirewallEnabled: true,
    networkCategory: 'unknown',
    inspectionAvailable: false
  }
}

function parseNetworkCategory(value: unknown): WindowsNetworkCategory {
  if (value === 'Private') {
    return 'private'
  }
  if (value === 'Public') {
    return 'public'
  }
  return value === 'DomainAuthenticated' ? 'domain' : 'unknown'
}

function readMobilePort(endpoint: string | null): number | null {
  if (!endpoint) {
    return null
  }
  try {
    const port = Number(new URL(endpoint).port)
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null
  } catch {
    return null
  }
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function buildInspectionScript(port: number, executablePath: string, address?: string): string {
  const addressLookup = address
    ? `
try {
  $ip = Get-NetIPAddress -IPAddress ${quotePowerShell(address)} -ErrorAction Stop | Select-Object -First 1
  $localAddress = [string]$ip.IPAddress
  $localPrefixLength = [int]$ip.PrefixLength
  $profile = Get-NetConnectionProfile -InterfaceIndex $ip.InterfaceIndex -ErrorAction Stop | Select-Object -First 1
  if ($profile) { $networkCategory = [string]$profile.NetworkCategory }
} catch {}`
    : ''
  // Why: ActiveStore includes GPO-applied rules and filter properties are locale-independent.
  return `$ErrorActionPreference = 'Stop'
$matchingRuleScopes = @()
$blockingRuleDetected = $false
$rules = @(Get-NetFirewallApplicationFilter -PolicyStore ActiveStore -Program ${quotePowerShell(executablePath)} -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' })
foreach ($rule in $rules) {
  $portFilter = $rule | Get-NetFirewallPortFilter
  $protocol = [string]$portFilter.Protocol
  $profile = [string]$rule.Profile
  $portMatches = @($portFilter.LocalPort | Where-Object { [string]$_ -eq 'Any' -or [string]$_ -eq '${port}' }).Count -gt 0
  if (($protocol -eq 'Any' -or $protocol -eq 'TCP' -or $protocol -eq '6') -and ($profile -eq 'Any' -or $profile -match 'Private') -and $portMatches) {
    if ([string]$rule.Action -eq 'Block') {
      $blockingRuleDetected = $true
    } elseif ([string]$rule.Action -eq 'Allow') {
      $addressFilter = $rule | Get-NetFirewallAddressFilter
      $matchingRuleScopes += [pscustomobject]@{ remoteAddresses = @($addressFilter.RemoteAddress | ForEach-Object { [string]$_ }) }
    }
  }
}
$privateFirewallEnabled = [bool](Get-NetFirewallProfile -PolicyStore ActiveStore -Name Private).Enabled
$networkCategory = 'Unknown'${addressLookup}
[pscustomobject]@{
  matchingRuleScopes = @($matchingRuleScopes)
  blockingRuleDetected = $blockingRuleDetected
  localAddress = $localAddress
  localPrefixLength = $localPrefixLength
  privateFirewallEnabled = $privateFirewallEnabled
  networkCategory = $networkCategory
} | ConvertTo-Json -Depth 4 -Compress`
}

function buildRepairScript(port: number, executablePath: string): string {
  // Why: Windows gives explicit Block rules precedence over narrower Allow rules.
  return `$ErrorActionPreference = 'Stop'
$blockingRules = @(Get-NetFirewallApplicationFilter -Program ${quotePowerShell(executablePath)} -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' })
foreach ($rule in $blockingRules) {
  $portFilter = $rule | Get-NetFirewallPortFilter
  $protocol = [string]$portFilter.Protocol
  $profile = [string]$rule.Profile
  $portMatches = @($portFilter.LocalPort | Where-Object { [string]$_ -eq 'Any' -or [string]$_ -eq '${port}' }).Count -gt 0
  if (($protocol -eq 'Any' -or $protocol -eq 'TCP' -or $protocol -eq '6') -and ($profile -eq 'Any' -or $profile -match 'Private') -and $portMatches) {
    $rule | Remove-NetFirewallRule
  }
}
Get-NetFirewallRule -Name ${quotePowerShell(FIREWALL_RULE_NAME)} -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Name ${quotePowerShell(FIREWALL_RULE_NAME)} -DisplayName ${quotePowerShell(FIREWALL_RULE_DISPLAY_NAME)} -Description 'Allows Yiru Mobile to connect to this Yiru daemon on private networks.' -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol TCP -LocalPort ${port} -Program ${quotePowerShell(executablePath)} -EdgeTraversalPolicy Block | Out-Null`
}

function buildElevationScript(powershellPath: string, encodedRepairScript: string): string {
  return `$ErrorActionPreference = 'Stop'
try {
  $process = Start-Process -FilePath ${quotePowerShell(powershellPath)} -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', '${encodedRepairScript}') -Verb RunAs -Wait -PassThru
  [pscustomobject]@{ launched = $true; exitCode = $process.ExitCode } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ launched = $false; nativeErrorCode = $_.Exception.NativeErrorCode } | ConvertTo-Json -Compress
}`
}

function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function getWindowsPowerShellPath(systemRoot = 'C:\\Windows'): string {
  return win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function getRunner(environment: WindowsMobileFirewallEnvironment): PowerShellRunner {
  if (environment.runPowerShell) {
    return environment.runPowerShell
  }
  const powershellPath = getWindowsPowerShellPath(environment.systemRoot)
  return async (script, timeoutMs) => {
    const subprocess = Bun.spawn(
      [
        powershellPath,
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encodePowerShell(script)
      ],
      { stderr: 'pipe', stdout: 'pipe', timeout: timeoutMs, windowsHide: true }
    )
    const [exitCode, stdout, stderr] = await Promise.all([
      subprocess.exited,
      Bun.readableStreamToText(subprocess.stdout),
      Bun.readableStreamToText(subprocess.stderr)
    ])
    if (exitCode !== 0) {
      throw new Error(`windows_powershell_failed:${stderr.trim()}`)
    }
    return stdout
  }
}

async function openWindowsNetworkSettings(platform: NodeJS.Platform): Promise<boolean> {
  if (platform !== 'win32') {
    return false
  }
  try {
    const subprocess = Bun.spawn(['explorer.exe', 'ms-settings:network'], {
      detached: true,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      windowsHide: true
    })
    subprocess.unref()
    return true
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
