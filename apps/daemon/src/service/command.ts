import { resolve } from 'node:path'

export type DaemonServiceCommand = {
  arguments: string[]
  executable: string
}

export function resolveDaemonServiceCommand(): DaemonServiceCommand {
  const executable = resolve(process.execPath)
  if (!isBunInterpreter(executable)) {
    return { arguments: ['daemon'], executable }
  }
  const entry = process.argv[1]?.trim()
  if (!entry) {
    throw new Error('daemon_service_entry_unavailable')
  }
  return { arguments: [resolve(entry), 'daemon'], executable }
}

function isBunInterpreter(executable: string): boolean {
  return /(?:^|[/\\])bun(?:\.exe)?$/i.test(executable)
}
