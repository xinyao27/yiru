import type { BrowserPageHandle } from '../browser/page/handle'

export type BrowserCommandTargetParams = {
  worktree?: string
  page?: string
}

export type ResolvedBrowserCommandTarget = {
  worktreeId?: string
  browserPageId?: string
}

export type ResolvedBrowserPage = {
  browserPageId: string
  page: BrowserPageHandle
}

export type BrowserScreencastParams = {
  format: 'jpeg' | 'png'
  quality?: number
  maxWidth?: number
  maxHeight?: number
  viewportWidth?: number
  viewportHeight?: number
  deviceScaleFactor?: number
  mobile?: boolean
  everyNthFrame?: number
  minFrameIntervalMs?: number
} & BrowserCommandTargetParams

export type ActiveBrowserScreencastPage = {
  stop: () => void
  done: Promise<void>
}

export const BROWSER_NAVIGATION_STATE_REPUBLISH_DELAY_MS = 100

export function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function clampOptionalInteger(
  value: number | undefined,
  min: number,
  max: number
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function clampOptionalNumber(
  value: number | undefined,
  min: number,
  max: number
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return Math.min(max, Math.max(min, value))
}
