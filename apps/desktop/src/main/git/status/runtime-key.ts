import type { GitRuntimeOptions } from '../runtime-options'

export function gitRuntimeOptionsKey(options: GitRuntimeOptions): readonly unknown[] {
  return [options.wslDistro ?? null]
}
