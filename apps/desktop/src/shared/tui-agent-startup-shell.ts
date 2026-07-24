import {
  commandSeparator,
  planAgentCliArgsSuffix,
  quoteStartupArg,
  resolveStartupShell,
  tokenizeStartupCommand,
  type AgentCliArgsPlan,
  type AgentStartupShell,
  type StartupCommandTokens
} from '@yiru/workbench-model/agent'

export {
  commandSeparator,
  planAgentCliArgsSuffix,
  quoteStartupArg,
  resolveStartupShell,
  tokenizeStartupCommand,
  type AgentCliArgsPlan,
  type AgentStartupShell,
  type StartupCommandTokens
}

export function buildShellCommandFromArgv(
  args: readonly string[],
  shell: AgentStartupShell
): string {
  const command = args.map((arg) => quoteStartupArg(arg, shell)).join(' ')
  if (shell === 'powershell' && command) {
    return `& ${command}`
  }
  return command
}

export function clearEnvCommand(name: string, shell: AgentStartupShell): string {
  if (shell === 'powershell') {
    return `Remove-Item Env:${name} -ErrorAction SilentlyContinue`
  }
  if (shell === 'cmd') {
    return `set "${name}="`
  }
  return `unset ${name}`
}
