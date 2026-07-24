import { nativeImage, type NativeImage } from 'electron'

// Why: 5px pixel capitals remain legible in the 14pt menu-bar template while
// fitting the existing transparent area, so dev and production keep equal width.
const DEV_BADGE_ROWS = ['##..###.#.#', '#.#.#...#.#', '#.#.##..#.#', '#.#.#...#.#', '##..###..#.']
const BADGE_OFFSET_X = 0
const BADGE_OFFSET_Y = 3
const BADGE_CLEAR_MARGIN = 1

/** Returns a template-image copy with a compact DEV mark stamped into it. */
export function stampTrayDevBadge(base: NativeImage, scaleFactor = 1): NativeImage {
  const { width, height } = base.getSize()
  if (width <= 0 || height <= 0) {
    return base
  }

  const bitmap = Buffer.from(base.toBitmap({ scaleFactor }))
  const pixelWidth = width * scaleFactor
  const pixelHeight = height * scaleFactor
  const clearLeft = (BADGE_OFFSET_X - BADGE_CLEAR_MARGIN) * scaleFactor
  const clearTop = (BADGE_OFFSET_Y - BADGE_CLEAR_MARGIN) * scaleFactor
  const clearRight = (BADGE_OFFSET_X + DEV_BADGE_ROWS[0].length + BADGE_CLEAR_MARGIN) * scaleFactor
  const clearBottom = (BADGE_OFFSET_Y + DEV_BADGE_ROWS.length + BADGE_CLEAR_MARGIN) * scaleFactor

  for (let y = Math.max(0, clearTop); y < Math.min(pixelHeight, clearBottom); y += 1) {
    for (let x = Math.max(0, clearLeft); x < Math.min(pixelWidth, clearRight); x += 1) {
      bitmap.fill(0x00, (y * pixelWidth + x) * 4, (y * pixelWidth + x) * 4 + 4)
    }
  }

  for (const [row, pattern] of DEV_BADGE_ROWS.entries()) {
    for (let col = 0; col < pattern.length; col += 1) {
      if (pattern[col] !== '#') {
        continue
      }
      // Why: explicit pixel replication keeps the Retina mark the same physical size.
      for (let dy = 0; dy < scaleFactor; dy += 1) {
        for (let dx = 0; dx < scaleFactor; dx += 1) {
          const x = (BADGE_OFFSET_X + col) * scaleFactor + dx
          const y = (BADGE_OFFSET_Y + row) * scaleFactor + dy
          if (x >= pixelWidth || y >= pixelHeight) {
            continue
          }
          const offset = (y * pixelWidth + x) * 4
          bitmap[offset] = 0x00
          bitmap[offset + 1] = 0x00
          bitmap[offset + 2] = 0x00
          bitmap[offset + 3] = 0xff
        }
      }
    }
  }

  return nativeImage.createFromBitmap(bitmap, { width: pixelWidth, height: pixelHeight })
}
