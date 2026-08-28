import { useEffect, useState } from 'react'

export type ReviewPrPhase =
  | 'explorer'
  | 'review-hover'
  | 'review'
  | 'checks'
  | 'verified'
  | 'first-comment'
  | 'complete'

export const COMPLETE_REVIEW_PR_PHASE: ReviewPrPhase = 'complete'

export function useReviewPrStoryboard(): ReviewPrPhase {
  const [phase, setPhase] = useState<ReviewPrPhase>('explorer')

  useEffect(() => {
    let cancelled = false
    const timers = new Set<number>()
    const wait = (durationMs: number): Promise<void> =>
      new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer)
          resolve()
        }, durationMs)
        timers.add(timer)
      })
    const show = (next: ReviewPrPhase): void => {
      if (!cancelled) {
        setPhase(next)
      }
    }
    const play = async (): Promise<void> => {
      while (!cancelled) {
        show('explorer')
        await wait(420)
        show('review-hover')
        await wait(1560)
        show('review')
        await wait(980)
        show('checks')
        await wait(1050)
        show('verified')
        await wait(560)
        show('first-comment')
        await wait(520)
        show('complete')
        await wait(3420)
      }
    }
    void play()
    return () => {
      cancelled = true
      for (const timer of timers) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  return phase
}
