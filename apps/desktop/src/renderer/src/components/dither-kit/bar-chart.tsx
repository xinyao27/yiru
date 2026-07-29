import { DitherCanvasChart, type DitherChartPoint } from './canvas-chart'

export type BarChartProps = {
  ariaLabel: string
  data: DitherChartPoint[]
  formatValue: (value: number) => string
}

export function BarChart(props: BarChartProps): React.JSX.Element {
  return <DitherCanvasChart {...props} kind="bar" />
}
