export function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  const value = index === -1 ? undefined : args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    return undefined
  }
  return value
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

export function requireFlag(args: string[], name: string): string {
  const value = readFlag(args, name)
  if (!value) {
    throw new Error(`cli_flag_required:${name}`)
  }
  return value
}

export function requireNonnegativeIntegerFlag(args: string[], name: string): number {
  const value = Number(requireFlag(args, name))
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`cli_flag_invalid:${name}`)
  }
  return value
}
