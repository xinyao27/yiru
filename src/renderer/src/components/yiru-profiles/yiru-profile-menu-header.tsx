import { UserCircle as CircleUserRound } from '@phosphor-icons/react'
import { DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import type { YiruProfileSummary } from '../../../../shared/yiru-profiles'
import { YiruProfileAvatar } from './yiru-profile-avatar'

export function YiruProfileMenuHeader({
  profile,
  title,
  subtitle,
  showProfileAvatar
}: {
  profile: YiruProfileSummary
  title: string
  subtitle: string
  showProfileAvatar: boolean
}): React.JSX.Element {
  return (
    <DropdownMenuLabel className="px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {showProfileAvatar ? (
          <YiruProfileAvatar profile={profile} className="size-7 text-xs" />
        ) : (
          <CircleUserRound className="size-5 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-foreground">{title}</div>
          <div className="truncate text-[11px] font-medium text-muted-foreground">{subtitle}</div>
        </div>
      </div>
    </DropdownMenuLabel>
  )
}
