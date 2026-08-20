import { useEffect, useMemo, useRef, useState } from 'react'

const MINUTE_MS = 60_000
const BOUNDARY_GRACE_MS = 25

function resetTimesKey(resetTimes: readonly (number | null | undefined)[]): string {
  return resetTimes
    .filter((resetAt): resetAt is number => resetAt != null && Number.isFinite(resetAt))
    .sort((left, right) => left - right)
    .join('|')
}

function parseResetTimesKey(key: string): number[] {
  return key.length === 0 ? [] : key.split('|').map(Number)
}

function getNextTickDelay(now: number, resetTimes: readonly number[]): number | null {
  const delays = resetTimes
    .filter((resetAt) => resetAt > now)
    .map((resetAt) => ((resetAt - now) % MINUTE_MS) + BOUNDARY_GRACE_MS)
  return delays.length > 0 ? Math.max(BOUNDARY_GRACE_MS, Math.min(...delays)) : null
}

/** Keeps compact reset labels current without one interval per provider row. */
export function useResetCountdownClock(resetTimes: readonly (number | null | undefined)[]): number {
  const [scheduledNow, setScheduledNow] = useState(() => Date.now())
  const key = useMemo(() => resetTimesKey(resetTimes), [resetTimes])
  const times = useMemo(() => parseResetTimesKey(key), [key])
  const previousKeyRef = useRef(key)
  const immediateNowRef = useRef(scheduledNow)

  if (previousKeyRef.current !== key) {
    previousKeyRef.current = key
    immediateNowRef.current = Date.now()
  }

  const now = Math.max(scheduledNow, immediateNowRef.current)
  useEffect(() => {
    const delayMs = getNextTickDelay(now, times)
    if (delayMs === null) {
      return
    }
    const timeout = window.setTimeout(() => setScheduledNow(Date.now()), delayMs)
    return () => window.clearTimeout(timeout)
  }, [now, times])

  return now
}
