const BOOLEAN_FLAGS = new Set(['focus', 'httpOnly', 'json', 'mobile', 'secure', 'show-profile'])

export function readBrowserFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`
  const assigned = args.find((arg) => arg.startsWith(prefix))
  if (assigned) {
    return assigned.slice(prefix.length)
  }
  const index = args.indexOf(`--${name}`)
  const value = index === -1 ? undefined : args[index + 1]
  return value === undefined || value.startsWith('--') ? undefined : value
}

export function hasBrowserFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`)
}

export function requireBrowserFlag(args: string[], name: string): string {
  const value = readBrowserFlag(args, name)
  if (value === undefined) {
    throw new Error(`cli_flag_required:--${name}`)
  }
  return value
}

export function readFiniteBrowserFlag(args: string[], name: string): number | undefined {
  const raw = readBrowserFlag(args, name)
  if (raw === undefined) {
    return undefined
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`cli_flag_invalid:--${name}`)
  }
  return value
}

export function requireFiniteBrowserFlag(args: string[], name: string): number {
  const value = readFiniteBrowserFlag(args, name)
  if (value === undefined) {
    throw new Error(`cli_flag_required:--${name}`)
  }
  return value
}

export function readPositiveBrowserFlag(args: string[], name: string): number | undefined {
  const value = readFiniteBrowserFlag(args, name)
  if (value !== undefined && value <= 0) {
    throw new Error(`cli_flag_invalid:--${name}`)
  }
  return value
}

export function readNonnegativeIntegerBrowserFlag(
  args: string[],
  name: string
): number | undefined {
  const value = readFiniteBrowserFlag(args, name)
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`cli_flag_invalid:--${name}`)
  }
  return value
}

export function browserCommandPositionals(args: string[]): string[] {
  const positionals: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }
    const assignment = token.slice(2)
    if (assignment.includes('=') || BOOLEAN_FLAGS.has(assignment)) {
      continue
    }
    if (args[index + 1] !== undefined && !args[index + 1].startsWith('--')) {
      index += 1
    }
  }
  return positionals
}
