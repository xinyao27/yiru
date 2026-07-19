export function shouldReadRemoteCliStdin(argv: string[]): boolean {
  if (argv.includes('--help') || argv.includes('-h')) {
    return false
  }
  // Why: flags ending in -stdin explicitly declare that the host CLI expects
  // piped input, so the relay must forward stdin instead of closing it early.
  return argv.some((part) => /^--[a-z0-9][a-z0-9-]*-stdin(?:=|$)/.test(part))
}
