import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import { ditherBackingSize, paintDitherColumn, resampleDitherValues } from './dither-paint'
import { MONOCHROME_DITHER_SEED } from './palette'
import { useChartDimensions } from './use-chart-dimensions'

export type DitherChartPoint = {
  label: string
  value: number
}

export type DitherCanvasChartProps = {
  ariaLabel: string
  data: DitherChartPoint[]
  formatValue: (value: number) => string
  kind: 'area' | 'bar'
  onActivate: () => void
}

export function DitherCanvasChart({
  ariaLabel,
  data,
  formatValue,
  kind,
  onActivate
}: DitherCanvasChartProps): React.JSX.Element {
  const { ref, size } = useChartDimensions<HTMLElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!(canvas && context) || size.width <= 0 || size.height <= 0) {
      return
    }
    drawDitherChart(context, canvas, data, kind, size)
  }, [data, kind, size])

  const hoveredPoint = hoverIndex === null ? null : data[hoverIndex]
  const hoverLeft =
    hoverIndex === null || data.length <= 1 ? 50 : (hoverIndex / (data.length - 1)) * 100

  return (
    <Button
      variant="chart"
      size="chart-plot"
      ref={ref}
      className="relative block"
      aria-label={ariaLabel}
      onClick={onActivate}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="h-[calc(100%-20px)] w-full [image-rendering:pixelated]"
      />
      <span
        className="absolute inset-0"
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const position = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left))
          setHoverIndex(
            Math.min(data.length - 1, Math.floor((position / bounds.width) * data.length))
          )
        }}
        onPointerLeave={() => setHoverIndex(null)}
      />
      {hoveredPoint ? (
        <span
          className="border-border bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 -translate-x-1/2 border px-2 py-1"
          style={{ left: `${hoverLeft}%` }}
        >
          <span className="text-muted-foreground block text-[10px]">{hoveredPoint.label}</span>
          <span className="text-foreground block text-[11px] font-medium tabular-nums">
            {formatValue(hoveredPoint.value)}
          </span>
        </span>
      ) : null}
      <ChartLabels data={data} kind={kind} />
    </Button>
  )
}

type ChartLabelsProps = {
  data: DitherChartPoint[]
  kind: DitherCanvasChartProps['kind']
}

function ChartLabels({ data, kind }: ChartLabelsProps): React.JSX.Element {
  const indexes = kind === 'bar' ? data.map((_, index) => index) : trendLabelIndexes(data.length)
  return (
    <span
      className={
        kind === 'bar'
          ? 'text-muted-foreground pointer-events-none absolute inset-x-0 bottom-0 grid auto-cols-fr grid-flow-col text-center text-[10px]'
          : 'text-muted-foreground pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px]'
      }
    >
      {indexes.map((index) => (
        <span key={`${index}-${data[index]?.label ?? ''}`}>{data[index]?.label}</span>
      ))}
    </span>
  )
}

function trendLabelIndexes(length: number): number[] {
  if (length <= 1) {
    return [0]
  }
  return [0, Math.floor((length - 1) / 2), length - 1]
}

function drawDitherChart(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: DitherChartPoint[],
  kind: DitherCanvasChartProps['kind'],
  size: { width: number; height: number }
): void {
  const { columns, rows } = ditherBackingSize(size.width, size.height - 20)
  canvas.width = columns
  canvas.height = rows
  context.clearRect(0, 0, columns, rows)
  const maxValue = Math.max(1, ...data.map((point) => Math.max(0, point.value)))
  if (kind === 'area') {
    drawArea(context, data, columns, rows, maxValue)
  } else {
    drawBars(context, data, columns, rows, maxValue)
  }
}

function drawArea(
  context: CanvasRenderingContext2D,
  data: DitherChartPoint[],
  columns: number,
  rows: number,
  maxValue: number
): void {
  const sourceRows = data.map(
    (point) => rows - 1 - (Math.max(0, point.value) / maxValue) * (rows - 4)
  )
  const topByColumn = resampleDitherValues(sourceRows, columns)
  for (let x = 0; x < columns; x++) {
    paintDitherColumn(context, x, topByColumn[x] ?? rows - 1, rows - 1, MONOCHROME_DITHER_SEED, {
      variant: 'gradient',
      intensity: 0
    })
  }
}

function drawBars(
  context: CanvasRenderingContext2D,
  data: DitherChartPoint[],
  columns: number,
  rows: number,
  maxValue: number
): void {
  const slotWidth = columns / Math.max(1, data.length)
  for (let index = 0; index < data.length; index++) {
    const value = Math.max(0, data[index]?.value ?? 0)
    const top = rows - 1 - (value / maxValue) * (rows - 4)
    const firstColumn = Math.ceil(index * slotWidth + slotWidth * 0.16)
    const lastColumn = Math.floor((index + 1) * slotWidth - slotWidth * 0.16)
    for (let x = firstColumn; x < lastColumn; x++) {
      paintDitherColumn(context, x, top, rows - 1, MONOCHROME_DITHER_SEED, {
        variant: 'hatched',
        intensity: 0
      })
    }
  }
}
