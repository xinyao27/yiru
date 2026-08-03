import { BrowserPane } from './browser-pane'
import { Cursor } from './cursor'
import { DiffPane } from './diff-pane'
import { Phone } from './phone'
import { SessionView } from './session-view'
import { PROJECT_NAME } from './state'
import type { DemoState, PaneGroup, TabId } from './state'
import { TabStrip } from './tab-strip'
import { WindowChrome } from './window-chrome'
import { WorktreeRail } from './worktree-rail'

function renderPane(tab: TabId, state: DemoState): React.JSX.Element {
  switch (tab) {
    case 'claude':
      return <SessionView state={state} />
    case 'diff':
      return <DiffPane state={state} />
    case 'browser':
      return <BrowserPane state={state} />
  }
}

function PaneColumn({ group, state }: { group: PaneGroup; state: DemoState }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TabStrip tabs={group.tabs} activeTab={group.activeTab} />
      <div className="flex min-w-0 flex-1">{renderPane(group.activeTab, state)}</div>
    </div>
  )
}

export type WorkspaceWindowProps = {
  state: DemoState
}

export function WorkspaceWindow({ state }: WorkspaceWindowProps): React.JSX.Element {
  return (
    <div className="border-hairline rounded-card relative flex min-w-0 flex-1 flex-col overflow-hidden border">
      <WindowChrome title={PROJECT_NAME} />
      {/* Why: sized to the tallest beat — the twelve-line diff hunk at 291px.
          Anything more leaves every other beat sitting in dead space. */}
      <div className="flex min-h-[318px]">
        <WorktreeRail state={state} />
        <div className="divide-hairline flex min-w-0 flex-1 divide-x">
          {state.groups.map((group) => (
            <PaneColumn key={group.tabs.join('-')} group={group} state={state} />
          ))}
        </div>
      </div>

      <Phone state={state} />

      <Cursor at={state.cursor} pressed={state.cursorPressed} />
    </div>
  )
}
