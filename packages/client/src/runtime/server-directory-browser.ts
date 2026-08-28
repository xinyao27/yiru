import type { DirEntry } from '@yiru/runtime-protocol/workbench/types'

import { callRuntimeOrpc } from './orpc-client'

export type RuntimeServerDirectoryListing = {
  resolvedPath: string
  entries: DirEntry[]
}

export async function browseRuntimeServerDirectory(
  environmentId: string,
  path: string
): Promise<RuntimeServerDirectoryListing> {
  return callRuntimeOrpc(
    { kind: 'environment', environmentId },
    (client) => client.files.browseServerDir,
    { path },
    { timeoutMs: 15_000 }
  )
}
