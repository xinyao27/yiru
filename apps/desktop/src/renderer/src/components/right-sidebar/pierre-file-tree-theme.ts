import type { CSSProperties } from 'react'

export const PIERRE_FILE_TREE_STYLE = {
  '--trees-bg-override': 'var(--sidebar)',
  '--trees-fg-override': 'var(--sidebar-foreground)',
  '--trees-fg-muted-override': 'var(--muted-foreground)',
  '--trees-bg-muted-override': 'var(--sidebar-accent)',
  '--trees-selected-bg-override': 'var(--sidebar-accent)',
  '--trees-selected-fg-override': 'var(--sidebar-accent-foreground)',
  '--trees-border-color-override': 'var(--sidebar-border)',
  '--trees-focus-ring-color-override': 'var(--sidebar-ring)',
  '--trees-border-radius-override': '0px',
  '--trees-font-family-override': 'var(--app-font-family)',
  '--trees-font-size-override': '12px',
  '--trees-item-margin-x-override': '0px',
  '--trees-item-padding-x-override': '8px',
  '--trees-padding-inline-override': '0px',
  '--trees-git-added-color-override': 'var(--git-decoration-added)',
  '--trees-git-modified-color-override': 'var(--git-decoration-modified)',
  '--trees-git-deleted-color-override': 'var(--git-decoration-deleted)',
  '--trees-git-renamed-color-override': 'var(--git-decoration-renamed)',
  '--trees-git-untracked-color-override': 'var(--git-decoration-untracked)',
  '--trees-git-ignored-color-override': 'var(--git-decoration-ignored)'
} as CSSProperties

// Why: rows and native rename fields live inside Pierre's Shadow DOM, so
// app-level radius and state rules need a narrow library-side bridge.
export const PIERRE_FILE_TREE_UNSAFE_CSS = `
  * { border-radius: 0 !important; }
  [data-item-git-status] > [data-item-section="icon"],
  [data-item-git-status] > [data-item-section="icon"] > :not([data-icon-name="file-tree-icon-chevron"]) {
    color: var(--trees-fg-muted) !important;
  }
  [data-yiru-native-drop-target="true"] {
    background-color: var(--trees-selected-bg) !important;
  }
  [data-yiru-flashing="true"] {
    background-color: var(--trees-selected-bg) !important;
    box-shadow: inset 0 0 0 1px var(--trees-focus-ring-color);
  }
`
