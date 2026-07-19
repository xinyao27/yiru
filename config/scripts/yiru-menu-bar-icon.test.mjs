import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { PNG } from 'pngjs'

const scriptDir = import.meta.dirname
const projectDir = dirname(dirname(scriptDir))
const trayDir = join(projectDir, 'resources', 'tray')

function alphaBounds(image) {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) {
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return { minX, minY, maxX, maxY }
}

function alphaRunCount(image, y) {
  let runs = 0
  let insideRun = false
  for (let x = 0; x < image.width; x++) {
    const alpha = image.data[(y * image.width + x) * 4 + 3]
    if (alpha > 0 && !insideRun) {
      runs++
    }
    insideRun = alpha > 0
  }
  return runs
}

describe('Yiru macOS menu-bar icon assets', () => {
  for (const [fileName, width, height] of [
    ['yiru-menu-barTemplate.png', 22, 14],
    ['yiru-menu-barTemplate@2x.png', 44, 28]
  ]) {
    it(`${fileName} contains the centered Yiru Y silhouette`, () => {
      const image = PNG.sync.read(readFileSync(join(trayDir, fileName)))
      const bounds = alphaBounds(image)

      expect([image.width, image.height]).toEqual([width, height])
      // Why: the legacy-brand glyph touched both side edges; Yiru's upright Y is
      // centered with two arms at the top and one stem at the bottom.
      expect(bounds.minX).toBeGreaterThan(0)
      expect(bounds.maxX).toBeLessThan(width - 1)
      expect(alphaRunCount(image, 0)).toBe(2)
      expect(alphaRunCount(image, height - 1)).toBe(1)
      expect(Math.abs((bounds.minX + bounds.maxX + 1) / 2 - width / 2)).toBeLessThanOrEqual(1)
    })
  }
})
