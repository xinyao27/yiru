import { randomUUID } from 'node:crypto'

import {
  encodeCoworkingHostSessionPageReleaseBinding,
  type CoworkingHostSessionPageBinding
} from './coworking-host-session-page-binding'

export type CoworkingHostBoundSessionPageCursor = {
  chainId: string
  innerCursor: string
}

export type CoworkingHostSessionPageChain = {
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

export type CoworkingHostResolvedSessionPageCursor = {
  chainId: string | null
  innerCursor: string | null
  settled: boolean
}

export function createCoworkingHostSessionPageChain(
  binding: CoworkingHostSessionPageBinding,
  bindingKey: string,
  releaseInnerCursor: (cursor: string) => void | Promise<void>
): CoworkingHostSessionPageChain {
  return {
    id: randomUUID(),
    bindingKey,
    releaseBindingKey: encodeCoworkingHostSessionPageReleaseBinding(binding),
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
