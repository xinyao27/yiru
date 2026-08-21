import { CoworkingAvailabilityStatusSegment } from './coworking-availability-status-segment'
import { YiruRuntimeStatusSegment } from './runtime-status/segment'

/**
 * Trailing footer shown while a Coworking remote workspace holds the view.
 *
 * Why: the full status bar is deliberately hidden there — its segments report
 * local ports, local resource usage and local git, which would all be wrong for
 * a peer's worktree. But hiding the whole footer also hid the connection signals
 * that matter in that exact moment: who is connected and whether the active
 * runtime host is still reachable. This keeps only those two signals.
 */
export function CoworkingPresenceFooter(): React.JSX.Element {
  return (
    <div className="border-border bg-background flex h-6 min-h-[24px] shrink-0 items-center border-t pr-3 text-xs select-none [[data-native-sidebar-material=true]_&]:bg-transparent">
      <div className="flex-1" />
      <div className="flex h-full shrink-0 items-center gap-0.5">
        <CoworkingAvailabilityStatusSegment />
        <YiruRuntimeStatusSegment />
      </div>
    </div>
  )
}
