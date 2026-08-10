import type { RpcClient } from '~/transport/rpc-client'
import { isRpcDeliveryUnknown } from '~/transport/rpc-delivery-ambiguity'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import { classifyMobileArtifact } from '../session/artifact-kind'
import {
  normalizeMobileFilePreviewResult,
  previewError,
  type MobileFilePreviewResult
} from './file-preview-response'
import {
  refreshTerminalArtifactSourceAfterGrantFailure,
  type MobileTerminalArtifactPreviewSource,
  type TerminalArtifactRetryOptions
} from './terminal-artifact-grant-refresh'

export {
  formatPreviewByteLength,
  normalizeMobileFilePreviewResponse,
  previewError
} from './file-preview-response'
export type { MobileFilePreviewResult, MobileFilePreviewTextKind } from './file-preview-response'

export type MobileFilePreviewReadKind = 'read' | 'preview'
export type MobileTerminalArtifactPreviewReadKind = 'terminal-read' | 'terminal-preview'

export type MobileFilePreviewSource =
  | {
      source: 'worktree'
      worktreeId: string
      relativePath: string
    }
  | MobileTerminalArtifactPreviewSource

export type MobileFilePreviewRequest =
  | {
      kind: MobileFilePreviewReadKind
      input: { worktree: string; relativePath: string }
    }
  | {
      kind: MobileTerminalArtifactPreviewReadKind
      input: { worktree: string; absolutePath: string; grantId: string }
    }

type MobileFilePreviewClient = Pick<RpcClient, 'orpc'>
type TerminalArtifactSource = MobileTerminalArtifactPreviewSource
type TerminalArtifactSaveOptions = TerminalArtifactRetryOptions & {
  baseContent?: string
}

export function createMobileFilePreviewRequest(
  worktreeIdOrSource: string | MobileFilePreviewSource,
  relativePath?: string
): MobileFilePreviewRequest {
  const source =
    typeof worktreeIdOrSource === 'string'
      ? { source: 'worktree' as const, worktreeId: worktreeIdOrSource, relativePath: relativePath! }
      : worktreeIdOrSource
  if (source.source === 'terminalArtifact') {
    const kind =
      classifyMobileArtifact(source.absolutePath) === 'image' ? 'terminal-preview' : 'terminal-read'
    return {
      kind,
      input: {
        worktree: `id:${source.worktreeId}`,
        absolutePath: source.absolutePath,
        grantId: source.grantId
      }
    }
  }
  return {
    kind: classifyMobileArtifact(source.relativePath) === 'image' ? 'preview' : 'read',
    input: {
      worktree: `id:${source.worktreeId}`,
      relativePath: source.relativePath
    }
  }
}

export async function loadMobileFilePreview(
  client: MobileFilePreviewClient,
  worktreeIdOrSource: string | MobileFilePreviewSource,
  relativePath?: string,
  options: TerminalArtifactRetryOptions = {}
): Promise<MobileFilePreviewResult> {
  let source = worktreeIdOrSource
  let request = createMobileFilePreviewRequest(source, relativePath)
  let result: unknown
  try {
    result = await readMobileFilePreview(client, request)
  } catch (error) {
    if (typeof source === 'string' || source.source !== 'terminalArtifact') {
      return previewError(errorMessage(error))
    }
    const refreshed = await refreshTerminalArtifactSourceAfterGrantFailure(
      client,
      source,
      error,
      options
    )
    if (!refreshed) {
      return previewError(errorMessage(error))
    }
    source = refreshed
    options.onTerminalArtifactSourceRefreshed?.(refreshed)
    request = createMobileFilePreviewRequest(source, relativePath)
    try {
      result = await readMobileFilePreview(client, request)
    } catch (retryError) {
      return previewError(errorMessage(retryError))
    }
  }
  const previewPath = typeof source === 'string' ? relativePath! : previewPathForSource(source)
  return normalizeMobileFilePreviewResult(previewPath, result)
}

export async function saveMobileTerminalArtifactPreview(
  client: MobileFilePreviewClient,
  source: TerminalArtifactSource,
  content: string,
  options: TerminalArtifactSaveOptions = {}
): Promise<MobileFilePreviewResult | { status: 'saved' }> {
  let writeSource = source
  if (typeof options.baseContent === 'string') {
    const verified = await verifyTerminalArtifactBaseContent(
      client,
      writeSource,
      options.baseContent,
      options
    )
    if (verified.status === 'error') {
      return verified.error
    }
    writeSource = verified.source
    if (verified.refreshed) {
      options.onTerminalArtifactSourceRefreshed?.(verified.source)
    }
  }
  let writeError: unknown
  try {
    await writeTerminalArtifactPreview(client, writeSource, content)
    return { status: 'saved' }
  } catch (error) {
    if (isRpcDeliveryUnknown(error)) {
      throw error
    }
    writeError = error
  }

  if (typeof options.baseContent !== 'string') {
    return previewError(errorMessage(writeError))
  }
  const refreshed = await refreshTerminalArtifactSourceAfterGrantFailure(
    client,
    writeSource,
    writeError,
    options
  )
  if (!refreshed) {
    return previewError(errorMessage(writeError))
  }
  const verified = await verifyTerminalArtifactBaseContent(client, refreshed, options.baseContent, {
    refreshGrant: false
  })
  if (verified.status === 'error') {
    return verified.error
  }
  options.onTerminalArtifactSourceRefreshed?.(refreshed)
  writeSource = verified.source
  try {
    await writeTerminalArtifactPreview(client, writeSource, content)
  } catch (error) {
    if (isRpcDeliveryUnknown(error)) {
      throw error
    }
    return previewError(errorMessage(error))
  }
  return { status: 'saved' }
}

async function verifyTerminalArtifactBaseContent(
  client: MobileFilePreviewClient,
  source: TerminalArtifactSource,
  baseContent: string,
  options: TerminalArtifactRetryOptions
): Promise<
  | { status: 'ok'; source: TerminalArtifactSource; refreshed: boolean }
  | { status: 'error'; error: MobileFilePreviewResult }
> {
  let readSource = source
  let request = createMobileFilePreviewRequest(readSource)
  let result: unknown
  let refreshed = false
  try {
    result = await readMobileFilePreview(client, request)
  } catch (error) {
    const nextSource = await refreshTerminalArtifactSourceAfterGrantFailure(
      client,
      readSource,
      error,
      options
    )
    if (!nextSource) {
      return {
        status: 'error',
        error: previewError(errorMessage(error))
      }
    }
    readSource = nextSource
    refreshed = true
    request = createMobileFilePreviewRequest(readSource)
    try {
      result = await readMobileFilePreview(client, request)
    } catch (retryError) {
      return { status: 'error', error: previewError(errorMessage(retryError)) }
    }
  }
  const latest = normalizeMobileFilePreviewResult(readSource.absolutePath, result)
  if (latest.status === 'error' || latest.status === 'waiting') {
    return { status: 'error', error: latest }
  }
  if (!terminalArtifactPreviewMatchesBase(latest, baseContent)) {
    return {
      status: 'error',
      error: {
        status: 'error',
        message: 'File changed on desktop. Reload preview before saving',
        reconnect: false
      }
    }
  }
  return { status: 'ok', source: readSource, refreshed }
}

function readMobileFilePreview(
  client: MobileFilePreviewClient,
  request: MobileFilePreviewRequest
): Promise<unknown> {
  switch (request.kind) {
    case 'read':
      return callRuntimeOrpc(client, (runtime) => runtime.files.read, request.input)
    case 'preview':
      return callRuntimeOrpc(client, (runtime) => runtime.files.readPreview, request.input)
    case 'terminal-read':
      return callRuntimeOrpc(client, (runtime) => runtime.files.readTerminalArtifact, request.input)
    case 'terminal-preview':
      return callRuntimeOrpc(
        client,
        (runtime) => runtime.files.readTerminalArtifactPreview,
        request.input
      )
  }
}

function writeTerminalArtifactPreview(
  client: MobileFilePreviewClient,
  source: TerminalArtifactSource,
  content: string
): Promise<unknown> {
  return callRuntimeOrpc(client, (runtime) => runtime.files.writeTerminalArtifact, {
    worktree: `id:${source.worktreeId}`,
    absolutePath: source.absolutePath,
    grantId: source.grantId,
    content
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function terminalArtifactPreviewMatchesBase(
  preview: MobileFilePreviewResult,
  baseContent: string
): boolean {
  if (preview.status === 'empty') {
    return baseContent.length === 0
  }
  return preview.status === 'ready' && preview.kind !== 'image' && preview.content === baseContent
}

function previewPathForSource(source: MobileFilePreviewSource): string {
  return source.source === 'terminalArtifact' ? source.absolutePath : source.relativePath
}
