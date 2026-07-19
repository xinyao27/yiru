import { randomUUID } from 'node:crypto'

import {
  encodeSpoolHostSessionPageReleaseBinding,
  type SpoolHostSessionPageBinding
} from './spool-host-session-page-binding'

export type SpoolHostBoundSessionPageCursor = {
  chainId: string
  innerCursor: string
}

export type SpoolHostSessionPageChain = {
  id: string
  bindingKey: string
  releaseBindingKey: string
  physicalConnectionId: string
  lastAccessedAt: number
  activeReads: number
  releaseRequested: boolean
  releaseInnerOnDelete: boolean
  latestInnerCursor: string | null
  releaseInnerCursor: (cursor: string) => void | Promise<void>
  cursors: string[]
  aliasesByInnerCursor: Map<string, string>
}

export type SpoolHostResolvedSessionPageCursor = {
  chainId: string | null
  innerCursor: string | null
  settled: boolean
}

export function createSpoolHostSessionPageChain(
  binding: SpoolHostSessionPageBinding,
  bindingKey: string,
  releaseInnerCursor: (cursor: string) => void | Promise<void>
): SpoolHostSessionPageChain {
  return {
    id: randomUUID(),
    bindingKey,
    releaseBindingKey: encodeSpoolHostSessionPageReleaseBinding(binding),
    physicalConnectionId: binding.physicalConnectionId,
    lastAccessedAt: Date.now(),
    activeReads: 0,
    releaseRequested: false,
    releaseInnerOnDelete: false,
    latestInnerCursor: null,
    releaseInnerCursor,
    cursors: [],
    aliasesByInnerCursor: new Map()
  }
}
