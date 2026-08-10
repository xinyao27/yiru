import type { RuntimeSkillUpdateRunEvent } from '@yiru/runtime-protocol/contract'

// Why: the shared skill-manage runner lives in `main/skills/`, outside the
// runtime class, and has no handle back to it. The runtime installs a
// publisher here at startup — the same shape as `setSettingsEventPublisher`.
let publish: (event: RuntimeSkillUpdateRunEvent) => void = () => {}

export function setSkillUpdateRunEventPublisher(
  publisher: (event: RuntimeSkillUpdateRunEvent) => void
): void {
  publish = publisher
}

export function publishSkillUpdateRunEvent(event: RuntimeSkillUpdateRunEvent): void {
  publish(event)
}
