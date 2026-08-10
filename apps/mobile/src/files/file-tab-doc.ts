import { buildImageDataUri } from '@yiru/workbench-model/ui'

import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import { classifyMobileArtifact } from '../session/artifact-kind'
import { buildMobileDiffLines, type MobileDiffLine } from '../session/diff/lines'
import { mobileDiffImageDataUri } from './diff-image-preview'

type FileTabDocClient = Pick<RpcClient, 'orpc'>

// The ready doc a session file tab renders. Mirrors the ready arm of the route's
// FileDocState; kept in src so the loader stays testable without the route.
export type MobileFileTabDoc =
  | { status: 'ready'; kind: 'file'; content: string; truncated: boolean; byteLength: number }
  | { status: 'ready'; kind: 'diff'; lines: MobileDiffLine[]; truncated: boolean }
  | { status: 'ready'; kind: 'image'; dataUri: string }
  | { status: 'ready'; kind: 'html'; content: string }

export type MobileFileTabDocRequest = {
  worktreeId: string
  relativePath: string
  diffSource?: 'staged' | 'unstaged' | 'branch' | 'commit'
}

// Throws 'binary_file'/'file_too_large'/the RPC error message; callers map those
// to error docs.
export async function resolveMobileFileTabDoc(
  client: FileTabDocClient,
  request: MobileFileTabDocRequest
): Promise<MobileFileTabDoc> {
  const worktree = `id:${request.worktreeId}`
  const { relativePath } = request
  if (request.diffSource === 'staged' || request.diffSource === 'unstaged') {
    const result = await callRuntimeOrpc(client, (runtime) => runtime.git.diff, {
      worktree,
      filePath: relativePath,
      staged: request.diffSource === 'staged'
    })
    if (result.kind !== 'text') {
      // Render image diffs (add/modify/delete) from the base64 the host already
      // sends; only non-previewable binaries stay unavailable.
      const dataUri = mobileDiffImageDataUri(result)
      if (!dataUri) {
        throw new Error('binary_file')
      }
      return { status: 'ready', kind: 'image', dataUri }
    }
    const diff = buildMobileDiffLines(result.originalContent, result.modifiedContent)
    return { status: 'ready', kind: 'diff', lines: diff.lines, truncated: diff.truncated }
  }

  const artifactKind = classifyMobileArtifact(relativePath)
  if (artifactKind === 'image') {
    const result = await callRuntimeOrpc(client, (runtime) => runtime.files.readPreview, {
      worktree,
      relativePath
    })
    const dataUri = result.isImage ? buildImageDataUri(result.mimeType, result.content) : null
    if (!dataUri) {
      throw new Error('binary_file')
    }
    return { status: 'ready', kind: 'image', dataUri }
  }

  const result = await callRuntimeOrpc(client, (runtime) => runtime.files.read, {
    worktree,
    relativePath
  })
  if (artifactKind === 'html') {
    return { status: 'ready', kind: 'html', content: result.content }
  }
  return {
    status: 'ready',
    kind: 'file',
    content: result.content,
    truncated: result.truncated,
    byteLength: result.byteLength
  }
}
