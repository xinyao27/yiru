const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function buildPosixCommand(input: {
  args: string[]
  command: string
  cwd?: string
  env?: Record<string, string>
}): string {
  const environment = Object.entries(input.env ?? {})
    .filter(([name]) => ENV_NAME_PATTERN.test(name))
    .map(([name, value]) => `${name}=${quotePosix(value)}`)
  const invocation = [input.command, ...input.args].map(quotePosix).join(' ')
  const withEnvironment =
    environment.length > 0 ? `env ${environment.join(' ')} ${invocation}` : invocation
  return input.cwd ? `cd -- ${quotePosix(input.cwd)} && ${withEnvironment}` : withEnvironment
}

export function buildPosixPtyCommand(input: {
  command?: string
  cwd: string
  env?: Record<string, string>
  shell?: string
}): string {
  const shell = input.shell?.trim() ? quotePosix(input.shell.trim()) : '${SHELL:-/bin/sh}'
  const environment = Object.entries(input.env ?? {})
    .filter(([name]) => ENV_NAME_PATTERN.test(name))
    .map(([name, value]) => `${name}=${quotePosix(value)}`)
  const prefix = environment.length > 0 ? `env ${environment.join(' ')} ` : ''
  const shellInvocation = input.command
    ? `${shell} -lc ${quotePosix(input.command)}`
    : `${shell} -l`
  return `cd -- ${quotePosix(input.cwd)} && exec ${prefix}${shellInvocation}`
}

export function quotePosix(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}
