export type YiruCliEnvironment = 'development' | 'production'

export type YiruCliExecutionHost = 'native' | 'wsl'

type YiruCliCommandResolution = {
  environment: YiruCliEnvironment
  executionHost?: YiruCliExecutionHost
  platform: NodeJS.Platform
  configuredCommand?: string | null
}

export function getYiruCliEnvironment(isPackaged: boolean): YiruCliEnvironment {
  return isPackaged ? 'production' : 'development'
}

export function resolveYiruCliCommandName(args: YiruCliCommandResolution): string {
  const configuredCommand = args.configuredCommand?.trim()
  if (configuredCommand) {
    return configuredCommand
  }
  if (args.environment === 'development') {
    return args.platform === 'win32' && args.executionHost !== 'wsl' ? 'yiru-dev.cmd' : 'yiru-dev'
  }
  return args.platform === 'win32' && args.executionHost !== 'wsl' ? 'yiru.cmd' : 'yiru'
}

export function getYiruCliCommandNameForPlatform(
  platform: NodeJS.Platform,
  environment: YiruCliEnvironment = 'production'
): string {
  return resolveYiruCliCommandName({ environment, platform })
}

export function rewriteYiruCliCommandPrefix(
  command: string,
  resolution: YiruCliCommandResolution
): string {
  const knownCommands = new Set<string>()
  for (const environment of ['development', 'production'] as const) {
    for (const platform of ['linux', 'win32'] as const) {
      for (const executionHost of ['native', 'wsl'] as const) {
        knownCommands.add(resolveYiruCliCommandName({ environment, executionHost, platform }))
      }
    }
  }
  const commandName = [...knownCommands]
    .sort((left, right) => right.length - left.length)
    .find((candidate) => command === candidate || command.startsWith(`${candidate} `))
  if (!commandName) {
    return command
  }
  return `${resolveYiruCliCommandName(resolution)}${command.slice(commandName.length)}`
}
