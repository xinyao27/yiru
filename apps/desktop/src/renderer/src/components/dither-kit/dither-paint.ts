import { ditherColor, type DitherSeed } from './palette'

// Why: this keeps Dither Kit's MIT-licensed Bayer texture while adapting its canvas engine to
// Yiru's dependency-free, monochrome chart surface. Source: https://tripwire.sh/dither-kit.
const BAYER_MATRIX = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
].map((row) => row.map((value) => (value + 0.5) / 16))

type DitherVariant = 'gradient' | 'hatched'

type PaintColumnOptions = {
  variant: DitherVariant
  intensity: number
}

export function paintDitherColumn(
  context: CanvasRenderingContext2D,
  x: number,
  top: number,
  floor: number,
  seed: DitherSeed,
  options: PaintColumnOptions
): void {
  const firstRow = Math.round(top)
  const lastRow = Math.round(floor)
  const depth = lastRow - firstRow
  if (depth <= 0) {
    context.fillStyle = ditherColor(seed.fill, 0.72)
    context.fillRect(x, firstRow, 1, 1)
    return
  }

  for (let y = firstRow; y < lastRow; y++) {
    const density = (y - firstRow) / depth
    if (options.variant === 'hatched' && ((x + y) & 3) >= 2) {
      continue
    }
    const threshold = BAYER_MATRIX[y & 3]?.[x & 3] ?? 0
    const isLit = density > threshold - options.intensity * 0.1
    const alpha = Math.min(1, (0.3 + density * 0.7) * (isLit ? 1 : 0.4))
    context.fillStyle = ditherColor(seed.fill, alpha)
    context.fillRect(x, y, 1, 1)
  }

  context.fillStyle = ditherColor(seed.fill, 0.72)
  context.fillRect(x, firstRow, 1, 1)
}

export function ditherBackingSize(
  width: number,
  height: number
): {
  columns: number
  rows: number
} {
  return {
    columns: Math.min(520, Math.max(8, Math.round(width / 2))),
    rows: Math.min(200, Math.max(8, Math.round(height / 2)))
  }
}

export function resampleDitherValues(values: number[], length: number): number[] {
  const output = Array.from({ length }, () => 0)
  const lastSourceIndex = Math.max(values.length - 1, 1)
  for (let index = 0; index < length; index++) {
    const sourcePosition = (index / Math.max(length - 1, 1)) * lastSourceIndex
    const firstIndex = Math.floor(sourcePosition)
    const fraction = sourcePosition - firstIndex
    const firstValue = values[firstIndex] ?? 0
    const secondValue = values[Math.min(firstIndex + 1, values.length - 1)] ?? firstValue
    output[index] = firstValue + (secondValue - firstValue) * fraction
  }
  return output
}
