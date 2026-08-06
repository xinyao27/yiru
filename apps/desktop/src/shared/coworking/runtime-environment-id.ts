import { createHash } from 'node:crypto'

const COWORKING_RUNTIME_ENVIRONMENT_ID_PATTERN = /^coworking-[a-f0-9]{32}$/

export function createCoworkingRuntimeEnvironmentId(nodeId: string): string {
  return `coworking-${createHash('sha256').update(nodeId).digest('hex').slice(0, 32)}`
}

export function isCoworkingRuntimeEnvironmentId(id: string): boolean {
  return COWORKING_RUNTIME_ENVIRONMENT_ID_PATTERN.test(id)
}
