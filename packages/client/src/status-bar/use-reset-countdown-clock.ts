import { useNow } from '~renderer/dashboard/use-now'

const COUNTDOWN_TICK_MS = 30_000

/** Keeps compact reset labels current without one interval per provider row. */
export function useResetCountdownClock(
  _resetTimes: readonly (number | null | undefined)[]
): number {
  return useNow(COUNTDOWN_TICK_MS)
}
