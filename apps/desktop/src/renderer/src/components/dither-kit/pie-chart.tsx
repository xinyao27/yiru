import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import { ditherBackingSize, ditherThreshold } from './dither-paint'
import { ditherColor, MONOCHROME_DITHER_SEED } from './palette'
import { useChartDimensions } from './use-chart-dimensions'

const FULL_CIRCLE = Math.PI * 2

export type DitherPieChartPoint = {
  key: string
  label: string
  value: number
}

type DitherPieChartProps = {
  ariaLabel: string
  data: readonly DitherPieChartPoint[]
  formatValue: (value: number) => string
  onActivate: () => void
  totalLabel: string
}

export function DitherPieChart({
  ariaLabel,
  data,
  formatValue,
  onActivate,
  totalLabel
}: DitherPieChartProps): React.JSX.Element {
  const chartData = useMemo(
    () => data.filter((point) => Number.isFinite(point.value) && point.value > 0),
    [data]
  )
  const { ref, size } = useChartDimensions<HTMLSpanElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const total = chartData.reduce((sum, point) => sum + point.value, 0)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!(canvas && context) || size.width <= 0 || size.height <= 0) {
      return
    }
    drawPie(context, canvas, chartData, size, hoverIndex)
  }, [chartData, hoverIndex, size])

  const hoveredPoint = hoverIndex === null ? null : chartData[hoverIndex]

  return (
    <Button
      variant="chart"
      size="chart"
      className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)]"
      aria-label={ariaLabel}
      onClick={onActivate}
    >
      <span
        ref={ref}
        className="relative block h-56 min-w-0"
        onPointerMove={(event) => {
          setHoverIndex(pointedSlice(event, chartData))
        }}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="h-full w-full [image-rendering:pixelated]"
        />
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {formatValue(total)}
          </span>
          <span className="text-muted-foreground mt-1 text-[10px] uppercase">{totalLabel}</span>
        </span>
        {hoveredPoint ? (
          <span className="bg-popover pointer-events-none absolute top-2 left-1/2 z-10 block -translate-x-1/2 border px-2 py-1">
            <span className="text-muted-foreground block max-w-44 truncate text-[10px]">
              {hoveredPoint.label}
            </span>
            <span className="text-foreground block text-[11px] font-medium tabular-nums">
              {formatValue(hoveredPoint.value)}
            </span>
          </span>
        ) : null}
      </span>

      <span className="grid content-center gap-2">
        {chartData.map((point, index) => (
          <span
            key={point.key}
            className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs"
            onPointerEnter={() => setHoverIndex(index)}
            onPointerLeave={() => setHoverIndex(null)}
          >
            <span
              className="border-border bg-muted-foreground size-2.5 shrink-0 border"
              style={{ opacity: legendOpacity(index) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{point.label}</span>
            <span className="text-foreground shrink-0 tabular-nums">
              {formatValue(point.value)}
            </span>
            <span className="text-muted-foreground w-10 shrink-0 text-right tabular-nums">
              {formatPercentage(point.value, total)}
            </span>
          </span>
        ))}
      </span>
    </Button>
  )
}

function pointedSlice(
  event: React.PointerEvent<HTMLSpanElement>,
  data: readonly DitherPieChartPoint[]
): number | null {
  const bounds = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - bounds.left - bounds.width / 2
  const y = event.clientY - bounds.top - bounds.height / 2
  const outerRadius = Math.min(bounds.width, bounds.height) * 0.45
  const distance = Math.hypot(x, y)
  if (distance < outerRadius * 0.52 || distance > outerRadius) {
    return null
  }
  let angle = Math.atan2(y, x) + Math.PI / 2
  if (angle < 0) {
    angle += FULL_CIRCLE
  }
  const total = data.reduce((sum, point) => sum + point.value, 0)
  return sliceAtFraction(data, total, angle / FULL_CIRCLE)
}

function drawPie(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: readonly DitherPieChartPoint[],
  size: { width: number; height: number },
  hoverIndex: number | null
): void {
  const { columns, rows } = ditherBackingSize(size.width, size.height)
  canvas.width = columns
  canvas.height = rows
  context.clearRect(0, 0, columns, rows)
  const total = data.reduce((sum, point) => sum + point.value, 0)
  if (total <= 0) {
    return
  }
  const centerX = columns / 2
  const centerY = rows / 2
  const outerRadius = Math.min(columns, rows) * 0.45
  const innerRadius = outerRadius * 0.52

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      paintPiePixel(context, x, y, {
        centerX,
        centerY,
        data,
        total,
        innerRadius,
        outerRadius,
        hoverIndex
      })
    }
  }
}

type PiePaintState = {
  centerX: number
  centerY: number
  data: readonly DitherPieChartPoint[]
  total: number
  innerRadius: number
  outerRadius: number
  hoverIndex: number | null
}

function paintPiePixel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: PiePaintState
): void {
  const deltaX = x + 0.5 - state.centerX
  const deltaY = y + 0.5 - state.centerY
  const distance = Math.hypot(deltaX, deltaY)
  if (distance < state.innerRadius || distance > state.outerRadius + 2) {
    return
  }
  let angle = Math.atan2(deltaY, deltaX) + Math.PI / 2
  if (angle < 0) {
    angle += FULL_CIRCLE
  }
  const sliceIndex = sliceAtFraction(state.data, state.total, angle / FULL_CIRCLE)
  if (sliceIndex === null) {
    return
  }
  const localOuterRadius =
    sliceIndex === state.hoverIndex ? state.outerRadius + 2 : state.outerRadius
  if (distance > localOuterRadius) {
    return
  }
  const density = (distance - state.innerRadius) / (localOuterRadius - state.innerRadius)
  const threshold = ditherThreshold(x + sliceIndex, y)
  const isLit = slicePatternIsLit(sliceIndex, x, y, density, threshold)
  const isRim = localOuterRadius - distance < 1.2 || distance - state.innerRadius < 1
  const alpha = isRim ? 0.82 : isLit ? legendOpacity(sliceIndex) : 0.12
  context.fillStyle = ditherColor(MONOCHROME_DITHER_SEED.fill, alpha)
  context.fillRect(x, y, 1, 1)
}

function sliceAtFraction(
  data: readonly DitherPieChartPoint[],
  total: number,
  fraction: number
): number | null {
  let boundary = 0
  for (let index = 0; index < data.length; index++) {
    boundary += (data[index]?.value ?? 0) / total
    if (fraction <= boundary) {
      return index
    }
  }
  return data.length > 0 ? data.length - 1 : null
}

function slicePatternIsLit(
  index: number,
  x: number,
  y: number,
  density: number,
  threshold: number
): boolean {
  const pattern = index % 4
  if (pattern === 1 && ((x + y) & 3) >= 2) {
    return false
  }
  if (pattern === 2 && ((x - y) & 3) >= 2) {
    return false
  }
  if (pattern === 3 && (x & 1) === 1) {
    return false
  }
  return density > threshold - 0.16
}

function legendOpacity(index: number): number {
  return 0.42 + (index % 4) * 0.14
}

function formatPercentage(value: number, total: number): string {
  return Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1
  }).format(total > 0 ? value / total : 0)
}
