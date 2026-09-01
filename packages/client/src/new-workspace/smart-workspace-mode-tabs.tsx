import type { Dispatch, RefObject, SetStateAction } from 'react'
import { Tabs, TabsList, TabsTrigger } from '~renderer/ui/tabs'

import type { getSmartWorkspaceNameModes } from './smart-workspace-localized-options'
import type { SmartNameMode } from './smart-workspace-source-results'

type SmartWorkspaceModeTabsProps = {
  availableModes: ReturnType<typeof getSmartWorkspaceNameModes>
  cancelInputFocusFrame: () => void
  disabled: boolean
  inputFocusFrameRef: RefObject<number | null>
  inputRef: RefObject<HTMLInputElement | null>
  markPopoverEngaged: () => void
  mode: SmartNameMode
  onActiveModeChange?: (mode: SmartNameMode) => void
  selectedSource: boolean
  setMode: Dispatch<SetStateAction<SmartNameMode>>
  setOpen: Dispatch<SetStateAction<boolean>>
  tabsListRef: RefObject<HTMLDivElement | null>
}

export function SmartWorkspaceModeTabs({
  availableModes,
  cancelInputFocusFrame,
  disabled,
  inputFocusFrameRef,
  inputRef,
  markPopoverEngaged,
  mode,
  onActiveModeChange,
  selectedSource,
  setMode,
  setOpen,
  tabsListRef
}: SmartWorkspaceModeTabsProps): React.JSX.Element {
  return (
    <div className="border-border/40 flex min-w-0 items-center gap-2 border-b">
      <Tabs
        value={mode}
        onValueChange={(next) => {
          const nextMode = next as SmartNameMode
          onActiveModeChange?.(nextMode)
          setMode(nextMode)
          if (!disabled && nextMode !== 'text' && !selectedSource) {
            markPopoverEngaged()
            setOpen(true)
          } else {
            setOpen(false)
          }
          cancelInputFocusFrame()
          inputFocusFrameRef.current = requestAnimationFrame(() => {
            inputFocusFrameRef.current = null
            inputRef.current?.focus({ preventScroll: true })
          })
        }}
        className="min-w-0 flex-1 gap-0"
      >
        <TabsList
          ref={tabsListRef}
          variant="line"
          className="h-7 w-full justify-start gap-4 px-0"
          onFocusCapture={(event) => {
            const previous = event.relatedTarget as HTMLElement | null
            const list = tabsListRef.current
            const input = inputRef.current
            if (!list || !input || !previous || previous === input || list.contains(previous)) {
              return
            }
            event.stopPropagation()
            input.focus({ preventScroll: true })
          }}
        >
          {availableModes.map(({ id, label, Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              tabIndex={-1}
              data-smart-name-mode={id}
              className="flex-none gap-1.5 px-0 text-xs"
            >
              <Icon className="size-3.5" />
              <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
