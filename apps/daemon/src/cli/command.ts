export type EntryCommand =
  | { argv: string[]; kind: 'daemon' }
  | { argv: string[]; kind: 'native-host' }
  | { argv: string[]; kind: 'native-install' }
  | { argv: string[]; kind: 'cli' }

export function selectEntryCommand(argv: string[]): EntryCommand {
  const [command, ...rest] = argv
  if (command === 'daemon') {
    return { argv: rest, kind: 'daemon' }
  }
  if (command === 'native-messaging') {
    return rest[0] === 'install'
      ? { argv: rest.slice(1), kind: 'native-install' }
      : { argv: rest, kind: 'native-host' }
  }
  if (command?.startsWith('chrome-extension://')) {
    return { argv, kind: 'native-host' }
  }
  return { argv, kind: 'cli' }
}
