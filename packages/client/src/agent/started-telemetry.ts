import type { EventProps } from '@yiru/runtime-protocol/workbench/telemetry-events'

/** Payload reported only after the matching agent PTY spawn succeeds. */
export type AgentStartedTelemetry = EventProps<'agent_started'>
