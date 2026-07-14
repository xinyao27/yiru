import { execFile } from 'node:child_process'
import { win32 } from 'node:path'
import type {
  SpoolWindowsFirewallRepairResult,
  SpoolWindowsFirewallStatus
} from '../../shared/spool/spool-windows-firewall-contract'

export const SPOOL_WINDOWS_FIREWALL_RULE_NAME = 'Orca.Spool'

const POWERSHELL_TIMEOUT_MS = 10_000
const ELEVATION_TIMEOUT_MS = 5 * 60_000

type PowerShellRunner = (script: string, timeoutMs: number) => Promise<string>

export type SpoolWindowsFirewallEnvironment = {
  platform: NodeJS.Platform
  isPackaged: boolean
  executablePath: string
  systemRoot?: string
  runPowerShell?: PowerShellRunner
}

type ElevationResult = {
  launched: boolean
  exitCode?: number
  nativeErrorCode?: number
}

export async function inspectWindowsSpoolFirewall(
  port: number,
  environment: SpoolWindowsFirewallEnvironment
): Promise<SpoolWindowsFirewallStatus> {
  if (!isSupported(environment)) {
    return { supported: false }
  }

  try {
    const stdout = await getRunner(environment)(
      buildInspectionScript(port, environment.executablePath),
      POWERSHELL_TIMEOUT_MS
    )
    const result = JSON.parse(stdout.trim()) as { ready?: unknown }
    return {
      supported: true,
      port,
      ruleAllowed: result.ready === true,
      inspectionAvailable: true
    }
  } catch {
    // Why: an unavailable inspection is itself actionable; the renderer keeps
    // the elevated repair path visible instead of reducing this to a timeout.
    return { supported: true, port, ruleAllowed: false, inspectionAvailable: false }
  }
}

export async function repairWindowsSpoolFirewall(
  port: number,
  environment: SpoolWindowsFirewallEnvironment
): Promise<SpoolWindowsFirewallRepairResult> {
  if (!isSupported(environment)) {
    return { ok: false, reason: 'unsupported' }
  }

  const powershellPath = getWindowsPowerShellPath(environment.systemRoot)
  const repairScript = buildRepairScript(port, environment.executablePath)
  const elevationScript = buildElevationScript(powershellPath, encodePowerShell(repairScript))
  try {
    const stdout = await getRunner(environment)(elevationScript, ELEVATION_TIMEOUT_MS)
    const result = JSON.parse(stdout.trim()) as ElevationResult
    if (!result.launched && result.nativeErrorCode === 1223) {
      return { ok: false, reason: 'cancelled' }
    }
    return result.launched && result.exitCode === 0 ? { ok: true } : { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

export async function assertWindowsSpoolFirewallReady(
  port: number,
  environment: SpoolWindowsFirewallEnvironment
): Promise<void> {
  const status = await inspectWindowsSpoolFirewall(port, environment)
  if (!status.supported || status.ruleAllowed) {
    return
  }
  throw new Error('spool_windows_firewall_unavailable')
}

function isSupported(environment: SpoolWindowsFirewallEnvironment): boolean {
  // Why: development Electron paths are transient and must not be persisted
  // into an elevated firewall rule that outlives the checkout.
  return environment.platform === 'win32' && environment.isPackaged
}

function buildInspectionScript(port: number, executablePath: string): string {
  return `$ErrorActionPreference = 'Stop'
$ready = $false
$rules = @(Get-NetFirewallRule -ErrorAction Stop | Where-Object { [string]$_.Name -eq ${quotePowerShell(SPOOL_WINDOWS_FIREWALL_RULE_NAME)} -or [string]$_.DisplayName -eq ${quotePowerShell(SPOOL_WINDOWS_FIREWALL_RULE_NAME)} })
if ($rules.Count -eq 1) {
  $rule = $rules[0]
  $app = $rule | Get-NetFirewallApplicationFilter
  $portFilter = $rule | Get-NetFirewallPortFilter
  $programMatches = [string]$app.Program -ieq ${quotePowerShell(executablePath)}
  $protocol = [string]$portFilter.Protocol
  $localPorts = @($portFilter.LocalPort | ForEach-Object { [string]$_ })
  $portMatches = $localPorts.Count -eq 1 -and $localPorts[0] -eq '${port}'
  $profile = [string]$rule.Profile
  $ready = $rule.Enabled -eq 'True' -and $rule.Direction -eq 'Inbound' -and $rule.Action -eq 'Allow' -and $programMatches -and ($protocol -eq 'TCP' -or $protocol -eq '6') -and $portMatches -and $profile -eq 'Private' -and [string]$rule.EdgeTraversalPolicy -eq 'Block'
}
[pscustomobject]@{ ready = $ready } | ConvertTo-Json -Compress`
}

function buildRepairScript(port: number, executablePath: string): string {
  return `$ErrorActionPreference = 'Stop'
Get-NetFirewallRule -ErrorAction Stop | Where-Object { [string]$_.Name -eq ${quotePowerShell(SPOOL_WINDOWS_FIREWALL_RULE_NAME)} -or [string]$_.DisplayName -eq ${quotePowerShell(SPOOL_WINDOWS_FIREWALL_RULE_NAME)} } | Remove-NetFirewallRule
New-NetFirewallRule -Name ${quotePowerShell(SPOOL_WINDOWS_FIREWALL_RULE_NAME)} -DisplayName ${quotePowerShell(SPOOL_WINDOWS_FIREWALL_RULE_NAME)} -Description 'Allows Orca Spool sharing over Tailscale on private networks.' -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol TCP -LocalPort ${port} -Program ${quotePowerShell(executablePath)} -EdgeTraversalPolicy Block | Out-Null`
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

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function getRunner(environment: SpoolWindowsFirewallEnvironment): PowerShellRunner {
  return environment.runPowerShell ?? createPowerShellRunner(environment.systemRoot)
}

function createPowerShellRunner(systemRoot?: string): PowerShellRunner {
  const powershellPath = getWindowsPowerShellPath(systemRoot)
  return (script, timeoutMs) =>
    new Promise((resolve, reject) => {
      execFile(
        powershellPath,
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(script)],
        {
          encoding: 'utf8',
          timeout: timeoutMs,
          windowsHide: true,
          maxBuffer: 64 * 1024
        },
        (error, stdout) => {
          if (error) {
            reject(error)
            return
          }
          resolve(stdout)
        }
      )
    })
}

function getWindowsPowerShellPath(systemRoot = 'C:\\Windows'): string {
  return win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}
