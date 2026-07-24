import { describe, expect, it, vi } from 'vite-plus/test'

const createFromBitmap = vi.hoisted(() =>
  vi.fn((buffer: Buffer, options: { width: number; height: number }) => ({ buffer, ...options }))
)

vi.mock('electron', () => ({ nativeImage: { createFromBitmap } }))

import { stampTrayDevBadge } from './tray-dev-badge'

function fakeTemplate(width: number, height: number) {
  return {
    getSize: () => ({ width, height }),
    toBitmap: ({ scaleFactor = 1 }: { scaleFactor?: number } = {}) =>
      Buffer.alloc(width * scaleFactor * height * scaleFactor * 4)
  }
}

describe('stampTrayDevBadge', () => {
  it('keeps the canvas dimensions and stamps visible template pixels', () => {
    stampTrayDevBadge(fakeTemplate(22, 14) as never)

    const [bitmap, dimensions] = createFromBitmap.mock.calls.at(-1)!
    expect(dimensions).toEqual({ width: 22, height: 14 })
    expect(
      [...bitmap].filter((value, index) => index % 4 === 3 && value === 0xff).length
    ).toBeGreaterThan(0)
  })

  it('returns an empty base unchanged', () => {
    const base = fakeTemplate(0, 0)
    expect(stampTrayDevBadge(base as never)).toBe(base)
  })
})
