import {
  buildConfiguredProxyEnv,
  type NetworkProxySettings
} from '@yiru/runtime-protocol/workbench/network-proxy'

import { applyClaudeEnvPatch } from '../agents/claude/accounts/environment'
import type { ClaudeRuntimeAuthPreparation } from '../agents/claude/accounts/runtime-auth-service'
import { resolveClaudeCommand } from '../runtime/cli-command'
import {
  getHiddenRateLimitWslCwdSetupCommands,
  resolveHiddenRateLimitPtyCwd
} from '../runtime/hidden-rate-limit-pty-cwd'

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function getProcessEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      environment[key] = value
    }
  }
  return environment
}

export function resolveClaudePtyLaunch(options?: {
  authPreparation?: ClaudeRuntimeAuthPreparation
  networkProxySettings?: NetworkProxySettings
}): {
  file: string
  args: string[]
  cwd: string
  env: Record<string, string>
} {
  const claudeCommand = resolveClaudeCommand()
  const isWindows = process.platform === 'win32'
  const environment = applyClaudeEnvPatch(
    { ...getProcessEnvironment(), TERM: 'xterm-256color' },
    options?.authPreparation?.envPatch ?? {},
    { stripAuthEnv: options?.authPreparation?.stripAuthEnv ?? false }
  )
  const proxyEnvironment = buildConfiguredProxyEnv(options?.networkProxySettings)
  Object.assign(environment, proxyEnvironment)
  const preparation = options?.authPreparation
  const wslConfig =
    preparation?.runtime === 'wsl' && preparation.wslDistro && preparation.wslLinuxConfigDir
      ? { distro: preparation.wslDistro, linuxConfigDir: preparation.wslLinuxConfigDir }
      : null

  const file = wslConfig ? 'wsl.exe' : isWindows ? 'cmd.exe' : claudeCommand
  const args = wslConfig
    ? [
        '-d',
        wslConfig.distro,
        '--',
        'bash',
        '-lc',
        [
          ...getHiddenRateLimitWslCwdSetupCommands(),
          `export CLAUDE_CONFIG_DIR=${shellQuote(wslConfig.linuxConfigDir)}`,
          ...Object.entries(proxyEnvironment).map(
            ([key, value]) => `export ${key}=${shellQuote(value)}`
          ),
          'exec claude'
        ].join(' && ')
      ]
    : isWindows
      ? ['/c', `"${claudeCommand}"`]
      : []

  return {
    file,
    args,
    cwd: resolveHiddenRateLimitPtyCwd(),
    env: environment
  }
}
