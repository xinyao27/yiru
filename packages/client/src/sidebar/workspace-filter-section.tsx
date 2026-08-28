import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { GitMerge, Moon } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Switch } from '~renderer/ui/switch'

const SidebarWorkspaceFilterSection = function SidebarWorkspaceFilterSection() {
  const showSleepingWorkspaces = useAppStore((s) => s.showSleepingWorkspaces)
  const setShowSleepingWorkspaces = useAppStore((s) => s.setShowSleepingWorkspaces)
  const hideDefaultBranchWorkspace = useAppStore((s) => s.hideDefaultBranchWorkspace)
  const setHideDefaultBranchWorkspace = useAppStore((s) => s.setHideDefaultBranchWorkspace)

  return (
    <>
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-muted-foreground text-[11px] font-semibold">
          {translate('auto.components.sidebar.SidebarWorkspaceFilterSection.82594419ba', 'Filters')}
        </span>
      </div>
      <FilterToggleRow
        icon={<Moon className="size-3.5" />}
        label={translate(
          'auto.components.sidebar.SidebarWorkspaceFilterSection.ed1611b65b',
          'Hide sleeping'
        )}
        checked={!showSleepingWorkspaces}
        onChange={(hideSleeping) => setShowSleepingWorkspaces(!hideSleeping)}
      />
      <FilterToggleRow
        icon={<GitMerge className="size-3.5" />}
        label={translate(
          'auto.components.sidebar.SidebarWorkspaceFilterSection.c3fa13dc2e',
          'Hide default branch'
        )}
        checked={hideDefaultBranchWorkspace}
        onChange={setHideDefaultBranchWorkspace}
      />
    </>
  )
}

function FilterToggleRow({
  icon,
  label,
  checked,
  onChange
}: {
  icon: React.ReactNode
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex w-full items-center justify-between gap-2 py-1.5 text-[12px]">
      <span className="text-foreground inline-flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </span>
      <Switch checked={checked} aria-label={label} onCheckedChange={onChange} />
    </div>
  )
}

export default SidebarWorkspaceFilterSection
