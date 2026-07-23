import type { EventProps } from '../../../shared/telemetry-events'

/** Payload reported only after the matching agent PTY spawn succeeds. */
export type AgentStartedTelemetry = EventProps<'agent_started'>
