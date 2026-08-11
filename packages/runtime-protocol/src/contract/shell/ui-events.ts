export type ShellNativeFileDropPayload =
  | { paths: string[]; target: 'editor' | 'composer' | 'project-sidebar' }
  | {
      paths: string[]
      target: 'terminal'
      tabId?: string
      paneLeafId?: string
    }
  | {
      paths: string[]
      target: 'file-explorer'
      destinationDir: string
    }
  | {
      byteLength: number
      pathCount: number
      reason: 'paths-too-large' | 'too-many-paths'
      target: 'rejected'
    }

export type ShellRichMarkdownCommand =
  | 'add-link'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inline-code'
  | 'code-block'
  | 'blockquote'
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'image'
  | 'divider'

export type ShellUiEvent =
  | { type: 'uiOpenSettings' }
  | { type: 'uiOpenSetupGuide' }
  | { type: 'uiOpenFeatureTour' }
  | { type: 'uiOpenCrashReport' }
  | { type: 'uiToggleLeftSidebar' }
  | { type: 'uiToggleRightSidebar' }
  | { type: 'uiToggleWorktreePalette' }
  | { type: 'uiToggleFloatingTerminal' }
  | { type: 'uiToggleAssistant' }
  | { type: 'uiTerminalShortcutCaptured'; actionId: string }
  | { type: 'uiOpenQuickOpen' }
  | { type: 'uiToggleQuickCommandsMenu' }
  | { type: 'uiOpenNewWorkspace' }
  | { type: 'uiDeleteCurrentWorkspace' }
  | { type: 'uiJumpToWorktreeIndex'; index: number }
  | { type: 'uiJumpToTabIndex'; index: number }
  | { type: 'uiWorktreeHistoryNavigate'; direction: 'back' | 'forward' }
  | { type: 'uiNewBrowserTab' }
  | { type: 'uiNewMarkdownTab' }
  | { type: 'uiNewSimulatorTab' }
  | { type: 'uiNewTerminalTab' }
  | { type: 'uiFocusBrowserAddressBar' }
  | { type: 'uiFindInBrowserPage' }
  | { type: 'uiReloadBrowserPage' }
  | { type: 'uiBrowserHistoryNavigate'; direction: 'back' | 'forward' }
  | { type: 'uiZoomBrowserPage'; direction: 'in' | 'out' | 'reset' }
  | { type: 'uiHardReloadBrowserPage' }
  | { type: 'uiCloseActiveTab' }
  | { type: 'uiSwitchTab'; direction: 1 | -1 }
  | { type: 'uiSwitchTabAcrossAllTypes'; direction: 1 | -1 }
  | { type: 'uiSwitchRecentTab' }
  | { type: 'uiSwitchTerminalTab'; direction: 1 | -1 }
  | { type: 'uiCtrlTabKeyDown'; shiftKey: boolean }
  | { type: 'uiCtrlTabKeyUp' }
  | { type: 'uiToggleStatusBar' }
  | { type: 'uiDictationKeyDown' }
  | { type: 'uiExportPdfRequested' }
  | { type: 'uiAppMenuPaste' }
  | { type: 'uiEditableContextPaste'; plainTextOnly: boolean }
  | { type: 'uiTerminalZoom'; direction: 'in' | 'out' | 'reset' }
  | { type: 'uiSystemResumed' }
  | { type: 'uiFileDrop'; payload: ShellNativeFileDropPayload }
  | {
      type: 'uiRichMarkdownContextCommand'
      command: ShellRichMarkdownCommand
      x: number
      y: number
    }
  | { type: 'uiFullscreenChanged'; isFullScreen: boolean }
  | { type: 'uiMaximizeChanged'; isMaximized: boolean }
  | { type: 'uiWindowCloseRequested'; isQuitting: boolean }
