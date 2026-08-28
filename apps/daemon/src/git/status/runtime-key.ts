import type { GitRuntimeOptions } from '../runner/runtime-options'

export function gitRuntimeOptionsKey(options: GitRuntimeOptions): readonly unknown[] {
  return [options.wslDistro ?? null]
}
