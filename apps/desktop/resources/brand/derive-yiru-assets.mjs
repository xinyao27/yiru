#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { PNG } from 'pngjs'

import {
  cropImage,
  findOpaqueBounds,
  resizeImage
} from '../../config/scripts/trim-windows-icon-source.mjs'

const brandDir = import.meta.dirname
const desktopDir = dirname(dirname(brandDir))
const repoRoot = dirname(dirname(desktopDir))
const mobileAssetsDir = join(repoRoot, 'apps', 'mobile', 'assets')
const resourcesDir = join(desktopDir, 'resources')
const appIconsDir = join(resourcesDir, 'app-icons')
const trayDir = join(resourcesDir, 'tray')
const rendererPublicDir = join(desktopDir, 'src', 'renderer', 'public')
const docsAssetsDir = join(repoRoot, 'docs', 'assets')

function readPng(path) {
  const png = PNG.sync.read(readFileSync(path))
  return { width: png.width, height: png.height, data: png.data }
}

function writePng(path, image) {
  const png = new PNG({ width: image.width, height: image.height })
  image.data.copy(png.data)
  writeFileSync(path, PNG.sync.write(png))
}

function createCanvas(width, height, color = [0, 0, 0, 0]) {
  const data = Buffer.alloc(width * height * 4)
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = color[0]
    data[offset + 1] = color[1]
    data[offset + 2] = color[2]
    data[offset + 3] = color[3]
  }
  return { width, height, data }
}

function composite(target, source, offsetX, offsetY) {
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const sourceOffset = (y * source.width + x) * 4
      const targetOffset = ((offsetY + y) * target.width + offsetX + x) * 4
      const sourceAlpha = source.data[sourceOffset + 3] / 255
      const targetAlpha = target.data[targetOffset + 3] / 255
      const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha)
      if (outputAlpha === 0) {
        continue
      }
      for (let channel = 0; channel < 3; channel++) {
        target.data[targetOffset + channel] = Math.round(
          (source.data[sourceOffset + channel] * sourceAlpha +
            target.data[targetOffset + channel] * targetAlpha * (1 - sourceAlpha)) /
            outputAlpha
        )
      }
      target.data[targetOffset + 3] = Math.round(outputAlpha * 255)
    }
  }
}

function fitOnCanvas(image, width, height, padding, background = [0, 0, 0, 0]) {
  const bounds = findOpaqueBounds(image, 1)
  if (!bounds) {
    throw new Error('Yiru wordmark source is fully transparent')
  }
  const cropped = cropImage(image, bounds)
  const availableWidth = width - padding * 2
  const availableHeight = height - padding * 2
  const scale = Math.min(availableWidth / cropped.width, availableHeight / cropped.height)
  const fitted = resizeImage(
    cropped,
    Math.max(1, Math.round(cropped.width * scale)),
    Math.max(1, Math.round(cropped.height * scale))
  )
  const canvas = createCanvas(width, height, background)
  composite(
    canvas,
    fitted,
    Math.floor((width - fitted.width) / 2),
    Math.floor((height - fitted.height) / 2)
  )
  return canvas
}

function createMask(image, color) {
  const data = Buffer.alloc(image.data.length)
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = color[0]
    data[offset + 1] = color[1]
    data[offset + 2] = color[2]
    data[offset + 3] = image.data[offset + 3]
  }
  return { width: image.width, height: image.height, data }
}

function removeMagentaSpill(image) {
  const data = Buffer.from(image.data)
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) {
      data[offset] = 0
      data[offset + 1] = 0
      data[offset + 2] = 0
      continue
    }
    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    if (red - green > 24 && blue - green > 24) {
      data[offset + 1] = Math.min(red, blue)
    }
  }
  return { width: image.width, height: image.height, data }
}

function transformBackground(image, kind) {
  const data = Buffer.from(image.data)
  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue)
    if (saturation < 28 || blue <= red) {
      continue
    }
    const lightness = (red + green + blue) / (255 * 3)
    if (kind === 'warm') {
      data[offset] = Math.round(188 + lightness * 67)
      data[offset + 1] = Math.round(102 + lightness * 116)
      data[offset + 2] = Math.round(58 + lightness * 112)
    } else {
      const gray = Math.round(red * 0.2 + green * 0.65 + blue * 0.15)
      data[offset] = Math.round(gray * 0.72)
      data[offset + 1] = Math.round(gray * 0.78)
      data[offset + 2] = Math.round(gray * 0.9)
    }
  }
  return { width: image.width, height: image.height, data }
}

function cropToAspect(image, aspectRatio) {
  const currentRatio = image.width / image.height
  if (currentRatio > aspectRatio) {
    const width = Math.round(image.height * aspectRatio)
    return cropImage(image, {
      minX: Math.floor((image.width - width) / 2),
      minY: 0,
      maxX: Math.floor((image.width - width) / 2) + width - 1,
      maxY: image.height - 1,
      width,
      height: image.height
    })
  }
  const height = Math.round(image.width / aspectRatio)
  return cropImage(image, {
    minX: 0,
    minY: Math.floor((image.height - height) / 2),
    maxX: image.width - 1,
    maxY: Math.floor((image.height - height) / 2) + height - 1,
    width: image.width,
    height
  })
}

function addDevBadge(image) {
  const output = { ...image, data: Buffer.from(image.data) }
  const centerX = 222
  const centerY = 222
  for (let y = 190; y < 256; y++) {
    for (let x = 190; x < 256; x++) {
      const distance = Math.hypot(x - centerX, y - centerY)
      const offset = (y * output.width + x) * 4
      if (distance <= 30) {
        output.data[offset] = 255
        output.data[offset + 1] = 100
        output.data[offset + 2] = 46
        output.data[offset + 3] = 255
      }
      const isStem = x >= 211 && x <= 218 && y >= 207 && y <= 237
      const outer = ((x - 219) / 19) ** 2 + ((y - 222) / 15) ** 2 <= 1
      const inner = ((x - 219) / 10) ** 2 + ((y - 222) / 8) ** 2 < 1
      if (isStem || (x >= 216 && outer && !inner)) {
        output.data[offset] = 255
        output.data[offset + 1] = 255
        output.data[offset + 2] = 255
        output.data[offset + 3] = 255
      }
    }
  }
  return output
}

const master = readPng(join(brandDir, 'yiru-app-icon-master.png'))
const classicIcon = readPng(join(resourcesDir, 'icon.png'))
const largeClassicIcon = readPng(join(resourcesDir, 'build', 'icon.png'))
const cleanWordmark = removeMagentaSpill(readPng(join(brandDir, 'yiru-wordmark.png')))
writePng(join(brandDir, 'yiru-wordmark.png'), cleanWordmark)

const adaptiveWordmark = fitOnCanvas(cleanWordmark, 1024, 1024, 140)
const adaptiveMask = createMask(adaptiveWordmark, [255, 255, 255])
const squareWordmark = fitOnCanvas(cleanWordmark, 1024, 1024, 112)
const blackSquareMask = createMask(squareWordmark, [0, 0, 0])
const uiMask = createMask(fitOnCanvas(cleanWordmark, 1024, 640, 28), [255, 255, 255])
const mobileIcon = readPng(join(mobileAssetsDir, 'adaptive-icon-background.png'))
composite(mobileIcon, adaptiveWordmark, 0, 0)

writePng(join(resourcesDir, 'yiru-wordmark.png'), uiMask)
writePng(join(mobileAssetsDir, 'wordmark.png'), resizeImage(uiMask, 512, 320))
writePng(join(mobileAssetsDir, 'icon.png'), mobileIcon)
writePng(join(mobileAssetsDir, 'adaptive-icon.png'), adaptiveWordmark)
writePng(join(mobileAssetsDir, 'adaptive-icon-monochrome.png'), adaptiveMask)
writePng(join(mobileAssetsDir, 'notification-icon.png'), fitOnCanvas(adaptiveMask, 96, 96, 5))

const favicon = resizeImage(largeClassicIcon, 48, 48)
writePng(join(mobileAssetsDir, 'favicon.png'), favicon)
writePng(join(rendererPublicDir, 'favicon.png'), favicon)
writePng(join(trayDir, 'yiru-windows-tray.png'), resizeImage(largeClassicIcon, 32, 32))
writePng(join(trayDir, 'yiru-menu-barTemplate.png'), fitOnCanvas(blackSquareMask, 22, 14, 1))
writePng(join(trayDir, 'yiru-menu-barTemplate@2x.png'), fitOnCanvas(blackSquareMask, 44, 28, 2))

writePng(join(appIconsDir, 'yiru-warm.png'), transformBackground(largeClassicIcon, 'warm'))
writePng(join(appIconsDir, 'yiru-graphite.png'), transformBackground(largeClassicIcon, 'graphite'))
writePng(join(resourcesDir, 'icon-dev.png'), addDevBadge(classicIcon))

const hero = resizeImage(cropToAspect(master, 16 / 9), 1600, 900)
writePng(join(docsAssetsDir, 'yiru-hero.png'), hero)

console.log('Derived complete Yiru wordmark assets from the reviewed raster sources.')
