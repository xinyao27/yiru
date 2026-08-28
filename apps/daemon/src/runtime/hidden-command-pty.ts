import { spawnBunHiddenCommandPty } from '../pty-provider/hidden-command'

type Disposable = {
  dispose: () => void
}

export type HiddenCommandPty = {
  destroy?: () => void
  kill: (signal?: string) => void
  onData: (callback: (data: string) => void) => Disposable
  onExit: (callback: () => void) => Disposable
  write: (data: string) => void
}

export type HiddenCommandPtyLaunch = {
  args: string[]
  cols: number
  cwd: string
  env: Record<string, string>
  file: string
  name: string
  rows: number
}

export async function spawnHiddenCommandPty(
  launch: HiddenCommandPtyLaunch
): Promise<HiddenCommandPty> {
  return spawnBunHiddenCommandPty(launch)
}
