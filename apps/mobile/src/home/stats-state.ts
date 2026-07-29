import type { HomeStatsByHost } from './stats-summary'

type HomeStatsListener = () => void
type HomeStatsUpdater = (previous: HomeStatsByHost) => HomeStatsByHost

let statsByHost: HomeStatsByHost = {}
const listeners = new Set<HomeStatsListener>()

export function getHomeStatsByHost(): HomeStatsByHost {
  return statsByHost
}

export function subscribeHomeStatsByHost(listener: HomeStatsListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateHomeStatsByHost(updater: HomeStatsUpdater): void {
  const next = updater(statsByHost)
  if (next === statsByHost) {
    return
  }
  statsByHost = next
  for (const listener of listeners) {
    listener()
  }
}

export function hydrateHomeStatsByHost(snapshot: HomeStatsByHost): void {
  updateHomeStatsByHost((previous) => (Object.keys(previous).length > 0 ? previous : snapshot))
}
