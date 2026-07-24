import { LoadingIndicator } from '@/components/loading-indicator'
import { cn } from '@/lib/class-names'

type ClaudeUsageLoadingStateProps = {
  title?: string
  summaryCardCount?: number
  summaryGridClassName?: string
}

export function ClaudeUsageLoadingState({
  title = 'Claude Usage Tracking',
  summaryCardCount = 8,
  summaryGridClassName = 'md:grid-cols-2 xl:grid-cols-4'
}: ClaudeUsageLoadingStateProps): React.JSX.Element {
  return (
    <div className="border-border/60 bg-card/30 space-y-4 border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-foreground text-sm font-semibold">{title}</h3>
          <div className="bg-muted/70 mt-2 h-3 w-40 animate-pulse" />
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start">
          <LoadingIndicator className="text-muted-foreground size-3.5" />
          <div className="bg-foreground/80 relative inline-flex h-5 w-9 shrink-0 items-center border border-transparent">
            <span className="bg-background pointer-events-none block size-3.5 translate-x-4" />
          </div>
        </div>
      </div>

      <div className="bg-muted/60 h-3 w-48 animate-pulse" />

      <div className={cn('grid gap-3', summaryGridClassName)}>
        {Array.from({ length: summaryCardCount }, (_, index) => (
          <div key={index} className="border-border/60 bg-card/40 space-y-3 border p-4">
            <div className="bg-muted/70 h-3 w-24 animate-pulse" />
            <div className="bg-muted/60 h-7 w-20 animate-pulse" />
          </div>
        ))}
      </div>

      <div className="border-border/60 bg-card/40 border p-4">
        <div className="mb-3 space-y-2">
          <div className="bg-muted/70 h-4 w-24 animate-pulse" />
          <div className="bg-muted/60 h-3 w-56 animate-pulse" />
        </div>
        <div className="grid h-56 grid-cols-10 items-end gap-3">
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className="flex h-full flex-col justify-end gap-2">
              <div className="bg-muted/60 mx-auto h-3 w-10 animate-pulse" />
              <div className="flex min-h-0 flex-1 items-end justify-center">
                <div
                  className="bg-muted/60 w-full max-w-12 animate-pulse"
                  style={{ height: `${35 + ((index % 5) + 1) * 10}%` }}
                />
              </div>
              <div className="bg-muted/60 mx-auto h-3 w-12 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
