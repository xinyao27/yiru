import { GitMerge, Moon, FlowArrow as Workflow } from '@phosphor-icons/react'
import React from 'react'

import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

const SidebarWorkspaceFilterSection = React.memo(function SidebarWorkspaceFilterSection() {
  const showSleepingWorkspaces = useAppStore((s) => s.showSleepingWorkspaces)
  const setShowSleepingWorkspaces = useAppStore((s) => s.setShowSleepingWorkspaces)
  const hideDefaultBranchWorkspace = useAppStore((s) => s.hideDefaultBranchWorkspace)
  const setHideDefaultBranchWorkspace = useAppStore((s) => s.setHideDefaultBranchWorkspace)
  const hideAutomationGeneratedWorkspaces = useAppStore((s) => s.hideAutomationGeneratedWorkspaces)
  const setHideAutomationGeneratedWorkspaces = useAppStore(
    (s) => s.setHideAutomationGeneratedWorkspaces
  )

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
      <FilterToggleRow
        icon={<Workflow weight="regular" className="size-3.5" />}
        label={translate(
          'auto.components.sidebar.SidebarWorkspaceFilterSection.automationCreated',
          'Hide automation-created'
        )}
        checked={hideAutomationGeneratedWorkspaces}
        onChange={setHideAutomationGeneratedWorkspaces}
      />
    </>
  )
})

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
