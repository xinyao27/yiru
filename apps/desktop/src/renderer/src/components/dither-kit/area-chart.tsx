import { DitherCanvasChart, type DitherChartPoint } from './canvas-chart'

export type AreaChartProps = {
  ariaLabel: string
  data: DitherChartPoint[]
  formatValue: (value: number) => string
  onActivate: () => void
}

export function AreaChart(props: AreaChartProps): React.JSX.Element {
  return <DitherCanvasChart {...props} kind="area" />
}
