import { useEffect, useRef } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'

import Sidebar from '../../sidebar/panel'
import { AgentMonitor } from '../agent-status/monitor'
import { AwayReplay } from '../away-replay/panel'
import { ContextInbox } from '../context/inbox'
import { ContextProjects } from '../context/projects'
import { hydrateSidePanelNavigation } from './hydration'

type SidePanelNavigationProps = {
  presentation: 'browser' | 'workbench'
}

export function SidePanelNavigation({ presentation }: SidePanelNavigationProps): React.JSX.Element {
  const worktreeScrollOffsetRef = useRef(0)
  const hasHydratedRef = useRef(false)
  const projectCatalog = useProjectCatalog()
  useEffect(() => {
    if (projectCatalog.isPending || hasHydratedRef.current) {
      return
    }
    hasHydratedRef.current = true
    void hydrateSidePanelNavigation(projectCatalog.repos)
  }, [projectCatalog.isPending, projectCatalog.repos])

  return (
    <Sidebar
      placement="right"
      surface={presentation === 'browser' ? 'navigation' : 'embedded-navigation'}
      worktreeScrollOffsetRef={worktreeScrollOffsetRef}
      navigationContent={
        <>
          <AgentMonitor />
          <AwayReplay />
          <ContextInbox />
          <ContextProjects />
        </>
      }
    />
  )
}
