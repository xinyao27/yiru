import type { HostCommandResult } from './contract'

const DEFAULT_HOST_COMMAND_TIMEOUT_MS = 30_000

export async function runHostProcess(
  argv: string[],
  options: {
    cwd?: string
    env?: Record<string, string>
    timeoutMs?: number
  } = {}
): Promise<HostCommandResult> {
  const child = Bun.spawn(argv, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    env: { ...process.env, ...options.env },
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_HOST_COMMAND_TIMEOUT_MS),
    stderr: 'pipe',
    stdout: 'pipe'
  })
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text()
  ])
  return { exitCode, stderr, stdout }
}

export function localEnvironment(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    ),
    ...overrides
  }
}
