import type { AppMemory } from '@yiru/runtime-protocol/workbench/types'

import type { ProcessIndex } from './process-enumeration'

export type RuntimeHostProcessMetric = {
  pid: number
  type?: string
  cpu?: { percentCPUUsage?: number }
  memory?: { workingSetSize?: number }
}

export type RuntimeHostProcessMetricsProvider = () => readonly RuntimeHostProcessMetric[]

export type AppMemoryBuckets = Omit<AppMemory, 'history'>

export function clampMemoryMetric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function processMetricMemoryBytes(
  processMetric: RuntimeHostProcessMetric,
  processIndex: ProcessIndex
): number {
  const hostMemory = processIndex.byPid.get(processMetric.pid)?.memory
  if (typeof hostMemory === 'number' && Number.isFinite(hostMemory) && hostMemory > 0) {
    return hostMemory
  }
  return clampMemoryMetric(processMetric.memory?.workingSetSize) * 1024
}

export function bucketHostProcessMetrics(
  processIndex: ProcessIndex,
  metrics: readonly RuntimeHostProcessMetric[]
): AppMemoryBuckets {
  const main = { cpu: 0, memory: 0 }
  const renderer = { cpu: 0, memory: 0 }
  const other = { cpu: 0, memory: 0 }
  for (const processMetric of metrics) {
    const cpu = clampMemoryMetric(processMetric.cpu?.percentCPUUsage)
    const memory = processMetricMemoryBytes(processMetric, processIndex)
    const type = (typeof processMetric.type === 'string' ? processMetric.type : '').toLowerCase()
    const target =
      type === 'browser' ? main : type === 'renderer' || type === 'tab' ? renderer : other
    target.cpu += cpu
    target.memory += memory
  }
  return {
    main,
    renderer,
    other,
    cpu: main.cpu + renderer.cpu + other.cpu,
    memory: main.memory + renderer.memory + other.memory
  }
}
