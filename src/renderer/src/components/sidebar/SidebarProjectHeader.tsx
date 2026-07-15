import type React from 'react'
import { cn } from '@/lib/utils'

type SidebarProjectHeaderIconProps = React.HTMLAttributes<HTMLDivElement> & {
  'data-repo-header-drag-handle'?: string
  'data-project-group-header-drag-handle'?: string
}

type SidebarProjectHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  paddingLeft: number
  icon?: React.ReactNode
  iconClassName?: string
  iconProps?: SidebarProjectHeaderIconProps
  label: React.ReactNode
  labelAfter?: React.ReactNode
}

export function SidebarProjectHeader({
  paddingLeft,
  icon,
  iconClassName,
  iconProps,
  label,
  labelAfter,
  children,
  className,
  style,
  ...props
}: SidebarProjectHeaderProps): React.JSX.Element {
  const { className: iconPropsClassName, ...restIconProps } = iconProps ?? {}

  return (
    <div
      className={cn(
        'group relative flex h-7 w-full items-center gap-1.5 pr-2 text-left transition-all',
        className
      )}
      style={{ ...style, paddingLeft }}
      {...props}
    >
      {icon ? (
        <div
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-[4px]',
            iconClassName,
            iconPropsClassName
          )}
          {...restIconProps}
        >
          {icon}
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 truncate text-[13px] font-semibold leading-none">{label}</div>
          {labelAfter}
        </div>
      </div>

      {children}
    </div>
  )
}
