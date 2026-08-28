import { Fragment } from 'react'
import { ArrowUp, CaretRight as ChevronRight, House as Home } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

type RemoteFileBrowserBreadcrumbsProps = {
  disabled: boolean
  onNavigate: (path: string) => void
  onNavigateUp: () => void
  resolvedPath: string
}

export function RemoteFileBrowserBreadcrumbs({
  disabled,
  onNavigate,
  onNavigateUp,
  resolvedPath
}: RemoteFileBrowserBreadcrumbsProps): React.JSX.Element {
  const pathSegments = resolvedPath.split('/').filter(Boolean)

  return (
    <div className="flex min-h-[28px] scrollbar-none items-center gap-0.5 overflow-x-auto">
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={onNavigateUp}
        disabled={resolvedPath === '/' || disabled}
        className="focus-visible:bg-accent h-auto border-0 p-1 transition-colors disabled:cursor-default disabled:opacity-30"
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => onNavigate('~')}
        disabled={disabled}
        className="focus-visible:bg-accent h-auto border-0 p-1 transition-colors"
      >
        <Home className="size-3.5" />
      </Button>
      <div className="text-muted-foreground ml-1 flex min-w-0 items-center gap-0 text-[11px]">
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={() => onNavigate('/')}
          className="hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent h-auto border-0 px-0.5 transition-colors"
        >
          /
        </Button>
        {pathSegments.map((segment, index) => {
          const segmentPath = `/${pathSegments.slice(0, index + 1).join('/')}`
          return (
            <Fragment key={segmentPath}>
              <ChevronRight className="text-muted-foreground/50 size-2.5 shrink-0" />
              <Button
                variant="ghost"
                size="xs"
                type="button"
                onClick={() => onNavigate(segmentPath)}
                className={cn(
                  'h-auto border-0 focus-visible:text-foreground focus-visible:bg-accent',
                  'truncate max-w-[120px] hover:text-foreground transition-colors px-0.5',
                  index === pathSegments.length - 1 && 'text-foreground'
                )}
              >
                {segment}
              </Button>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
