import { CONTEXT_MENU_TRIGGER_TYPE, type FileTreeRowDecoration } from '@pierre/trees'
import { FileTree, useFileTree } from '@pierre/trees/react'
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { translate } from '../../../i18n/i18n'
import { joinPath } from '../../../lib/path'
import { WORKSPACE_FILE_PATH_MIME } from '../../../lib/workspace-file-drag'
import { PIERRE_FILE_TREE_STYLE, PIERRE_FILE_TREE_UNSAFE_CSS } from '../pierre-file-tree-theme'
import type { SourceControlController } from './controller'
import { SUBMODULE_WORKTREE_ONLY_LABEL } from './panel-constants'
import {
  buildBranchPierreTreeData,
  buildUncommittedPierreTreeData,
  type SourceControlPierreTarget,
  type SourceControlPierreTreeData
} from './pierre-tree-data'
import { SourceControlPierreTreeMenu } from './pierre-tree-menu'
import type { SourceControlDisplaySectionId } from './section-order'
import { toPermanentSourceControlRowOpenEvent } from './split-open'
import { getSubmoduleExpansionKey } from './submodule-expansion'

const SOURCE_CONTROL_PIERRE_TREE_ROW_HEIGHT_PX = 26

type SourceControlPierreTreeStyle = CSSProperties & {
  '--trees-icon-nudge-override': string
  '--trees-icon-width-override': string
  '--trees-item-padding-x-override': string
  '--trees-item-row-gap-override': string
}

const SOURCE_CONTROL_PIERRE_TREE_STYLE: SourceControlPierreTreeStyle = {
  ...PIERRE_FILE_TREE_STYLE,
  '--trees-icon-nudge-override': '0px',
  '--trees-icon-width-override': '14px',
  '--trees-item-padding-x-override': '6px',
  '--trees-item-row-gap-override': '4px'
}

const SOURCE_CONTROL_PIERRE_TREE_UNSAFE_CSS = `${PIERRE_FILE_TREE_UNSAFE_CSS}
  :host {
    --trees-context-menu-trigger-inline-offset: calc(
      var(--trees-padding-inline) + var(--trees-item-padding-x) -
        var(--trees-focus-ring-width) + var(--trees-git-lane-width)
    );
  }
  /* Why: keep the stable git status at the trailing edge instead of letting
     the transient context-menu action push it inward. */
  [data-item-section="action"] { order: 1; }
  [data-item-section="git"] { order: 2; }
  /* Why: disclosure arrows align with the 14px source-control section caret. */
  [data-icon-name="file-tree-icon-chevron"] {
    color: var(--trees-fg-muted);
    height: 14px;
    width: 14px;
  }
`

function findTreeItemPath(event: React.SyntheticEvent<HTMLElement>): string | null {
  const eventPath = event.nativeEvent.composedPath()
  if (
    eventPath.some(
      (entry) =>
        entry instanceof HTMLElement &&
        (entry.dataset.type === CONTEXT_MENU_TRIGGER_TYPE ||
          entry.dataset.fileTreeContextMenuRoot === 'true')
    )
  ) {
    return null
  }
  const row = eventPath.find(
    (entry): entry is HTMLElement => entry instanceof HTMLElement && entry.dataset.type === 'item'
  )
  return row?.dataset.itemPath ?? null
}

function getEntryDecoration(
  target: Extract<SourceControlPierreTarget, { kind: 'uncommitted' | 'branch' }>,
  commentCount: number
): FileTreeRowDecoration | null {
  const parts: string[] = []
  if (target.kind === 'uncommitted' && target.entry.conflictStatus) {
    parts.push(
      target.entry.conflictStatus === 'unresolved'
        ? translate('auto.components.right.sidebar.SourceControl.31f6d46278', 'Unresolved')
        : translate('auto.components.right.sidebar.SourceControl.2c417432b7', 'Resolved locally')
    )
  }
  if (
    target.kind === 'uncommitted' &&
    target.entry.submoduleRoot === undefined &&
    target.entry.submodule?.commitChanged === false &&
    (target.entry.submodule.trackedChanges || target.entry.submodule.untrackedChanges)
  ) {
    parts.push(SUBMODULE_WORKTREE_ONLY_LABEL)
  }
  if (commentCount > 0) {
    parts.push(
      translate(
        'auto.components.right.sidebar.SourceControl.657e0c90ad',
        '{{value0}} note{{value1}}',
        { value0: commentCount, value1: commentCount === 1 ? '' : 's' }
      )
    )
  }
  if (typeof target.entry.added === 'number' && target.entry.added > 0) {
    parts.push(`+${target.entry.added}`)
  }
  if (typeof target.entry.removed === 'number' && target.entry.removed > 0) {
    parts.push(`-${target.entry.removed}`)
  }
  if (target.entry.status === 'copied') {
    parts.push('C')
  }
  const text = parts.join('  ')
  return text ? { text, title: parts.join(' · ') } : null
}

function getRowDecoration(
  target: SourceControlPierreTarget | undefined,
  controller: SourceControlController
): FileTreeRowDecoration | null {
  if (!target) {
    return null
  }
  if (target.kind === 'placeholder') {
    return { text: '', title: target.message }
  }
  if (target.kind === 'directory') {
    return target.node ? { text: String(target.node.fileCount) } : null
  }
  return getEntryDecoration(target, controller.diffCommentCountByPath.get(target.entry.path) ?? 0)
}

function getCanonicalParentPath(path: string): string {
  const pathWithoutTrailingSlash = path.endsWith('/') ? path.slice(0, -1) : path
  const separatorIndex = pathWithoutTrailingSlash.lastIndexOf('/')
  return separatorIndex < 0 ? '' : pathWithoutTrailingSlash.slice(0, separatorIndex + 1)
}

function countVisibleRows(data: SourceControlPierreTreeData): number {
  const childrenByParent = new Map<string, string[]>()
  for (const path of data.targetByCanonicalPath.keys()) {
    const parentPath = getCanonicalParentPath(path)
    const siblings = childrenByParent.get(parentPath)
    if (siblings) {
      siblings.push(path)
    } else {
      childrenByParent.set(parentPath, [path])
    }
  }
  const expandedPaths = new Set(data.expandedPaths)

  const countChildren = (parentPath: string): number => {
    let count = 0
    for (const childPath of childrenByParent.get(parentPath) ?? []) {
      count += 1
      if (!childPath.endsWith('/')) {
        continue
      }

      // Why: Pierre projects a sole-directory chain as one row whose terminal
      // directory owns expansion, but its public React model does not expose the visible count.
      let terminalPath = childPath
      let children = childrenByParent.get(terminalPath) ?? []
      while (children.length === 1 && children[0]?.endsWith('/')) {
        terminalPath = children[0]
        children = childrenByParent.get(terminalPath) ?? []
      }
      if (expandedPaths.has(terminalPath)) {
        count += countChildren(terminalPath)
      }
    }
    return count
  }

  return countChildren('')
}

function openTarget(
  controller: SourceControlController,
  target: SourceControlPierreTarget | undefined,
  event?: React.KeyboardEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  openAsPermanent = false
): void {
  const openEvent = openAsPermanent
    ? toPermanentSourceControlRowOpenEvent(
        event ?? {
          altKey: false,
          ctrlKey: false,
          metaKey: false,
          shiftKey: false
        }
      )
    : event
  if (target?.kind === 'uncommitted' && !target.isSubmodule) {
    controller.handleOpenDiff(target.entry, openEvent)
  } else if (target?.kind === 'branch') {
    controller.openCommittedDiff(target.entry, openEvent)
  }
}

function SourceControlPierreTree({
  controller,
  data,
  selectedRowKeys
}: {
  controller: SourceControlController
  data: SourceControlPierreTreeData
  selectedRowKeys: ReadonlySet<string>
}): React.JSX.Element {
  const callbacksRef = useRef({ controller, data })
  callbacksRef.current = { controller, data }
  const resettingRef = useRef(false)
  const selectedCanonicalPaths = useMemo(
    () =>
      [...selectedRowKeys].flatMap((key) => {
        const path = data.canonicalPathByRowKey.get(key)
        return path ? [path] : []
      }),
    [data.canonicalPathByRowKey, selectedRowKeys]
  )
  const { model } = useFileTree({
    paths: data.paths,
    flattenEmptyDirectories: true,
    initialExpansion: 'closed',
    initialExpandedPaths: data.expandedPaths,
    initialSelectedPaths: selectedCanonicalPaths,
    itemHeight: SOURCE_CONTROL_PIERRE_TREE_ROW_HEIGHT_PX,
    overscan: 20,
    stickyFolders: false,
    icons: { set: 'complete', colored: false },
    gitStatus: data.gitStatus,
    composition: {
      contextMenu: { enabled: true, triggerMode: 'both' }
    },
    dragAndDrop: {
      canDrag: (paths) =>
        paths.every((path) => {
          const target = callbacksRef.current.data.targetByCanonicalPath.get(path)
          return (
            target?.kind === 'branch' ||
            (target?.kind === 'uncommitted' &&
              !target.isSubmodule &&
              !(target.entry.conflictStatus === 'unresolved' && target.entry.status === 'deleted'))
          )
        }),
      canDrop: () => false
    },
    renderRowDecoration: ({ item }) =>
      getRowDecoration(
        callbacksRef.current.data.targetByCanonicalPath.get(item.path),
        callbacksRef.current.controller
      ),
    unsafeCSS: SOURCE_CONTROL_PIERRE_TREE_UNSAFE_CSS
  })
  useLayoutEffect(() => {
    resettingRef.current = true
    model.resetPaths(data.paths, { initialExpandedPaths: data.expandedPaths })
    resettingRef.current = false
  }, [data.expandedPaths, data.paths, model])

  useLayoutEffect(() => {
    model.setGitStatus(data.gitStatus)
  }, [data.gitStatus, model])

  useLayoutEffect(() => {
    const selectedPaths = new Set(selectedCanonicalPaths)
    resettingRef.current = true
    for (const path of model.getSelectedPaths()) {
      if (!selectedPaths.has(path)) {
        model.getItem(path)?.deselect()
      }
    }
    for (const path of selectedPaths) {
      model.getItem(path)?.select()
    }
    resettingRef.current = false
  }, [model, selectedCanonicalPaths])

  useEffect(
    () =>
      model.subscribe(() => {
        if (resettingRef.current) {
          return
        }
        const callbacks = callbacksRef.current
        for (const [path, target] of callbacks.data.targetByCanonicalPath) {
          const item = model.getItem(path)
          if (!item || !('isExpanded' in item)) {
            continue
          }
          if (target.kind === 'directory') {
            const isExpanded = !callbacks.controller.collapsedTreeDirs.has(target.collapseKey)
            if (item.isExpanded() !== isExpanded) {
              callbacks.controller.toggleTreeDir(target.collapseKey)
            }
          } else if (target.kind === 'uncommitted' && target.isSubmodule) {
            const expansionKey = getSubmoduleExpansionKey(target.entry)
            const isExpanded = callbacks.controller.expandedSubmoduleKeys.has(expansionKey)
            if (item.isExpanded() !== isExpanded) {
              callbacks.controller.toggleSubmodule(target.entry)
            }
          }
        }
      }),
    [model]
  )

  // Why: every source-control section shares the panel scroller; sizing the
  // tree to all visible rows prevents each section from gaining its own scroll.
  const height = Math.max(1, countVisibleRows(data)) * SOURCE_CONTROL_PIERRE_TREE_ROW_HEIGHT_PX

  return (
    <FileTree
      model={model}
      className="yiru-pierre-file-tree bg-sidebar block w-full"
      style={{ ...SOURCE_CONTROL_PIERRE_TREE_STYLE, height }}
      onClickCapture={(event) => {
        const path = findTreeItemPath(event)
        const target = path ? data.targetByCanonicalPath.get(path) : undefined
        if (event.detail > 1 && target?.kind === 'uncommitted' && target.isSubmodule) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        openTarget(controller, target, event)
      }}
      onDoubleClickCapture={(event) => {
        const path = findTreeItemPath(event)
        openTarget(controller, path ? data.targetByCanonicalPath.get(path) : undefined, event, true)
      }}
      onKeyDownCapture={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return
        }
        const path = model.getFocusedPath()
        if (!path) {
          return
        }
        const target = data.targetByCanonicalPath.get(path)
        if (target?.kind === 'uncommitted' && target.isSubmodule) {
          const item = model.getItem(path)
          if (item && 'toggle' in item) {
            item.toggle()
          }
        } else if (target?.kind === 'uncommitted' || target?.kind === 'branch') {
          openTarget(controller, target, event)
        } else {
          return
        }
        event.preventDefault()
      }}
      onDragStartCapture={(event) => {
        const path = findTreeItemPath(event)
        const target = path ? data.targetByCanonicalPath.get(path) : undefined
        if (target?.kind !== 'uncommitted' && target?.kind !== 'branch') {
          return
        }
        event.dataTransfer.setData(
          WORKSPACE_FILE_PATH_MIME,
          joinPath(controller.worktreePath ?? '', target.entry.path)
        )
        event.dataTransfer.effectAllowed = 'copy'
      }}
      renderContextMenu={(item) => {
        const target = data.targetByCanonicalPath.get(item.path)
        return target ? (
          <SourceControlPierreTreeMenu controller={controller} target={target} />
        ) : null
      }}
    />
  )
}

const EMPTY_SELECTED_ROW_KEYS: ReadonlySet<string> = new Set()

export function SourceControlPierreUncommittedTree({
  controller,
  sectionId
}: {
  controller: SourceControlController
  sectionId: SourceControlDisplaySectionId
}): React.JSX.Element {
  const roots = controller.treeRootsBySection[sectionId]
  const data = useMemo(
    () =>
      buildUncommittedPierreTreeData({
        roots: roots ?? [],
        collapsedDirectoryKeys: controller.collapsedTreeDirs,
        expandedSubmoduleKeys: controller.expandedSubmoduleKeys,
        submoduleStatusByKey: controller.submoduleStatusByKey
      }),
    [
      controller.collapsedTreeDirs,
      controller.expandedSubmoduleKeys,
      controller.submoduleStatusByKey,
      roots
    ]
  )
  return (
    <SourceControlPierreTree
      controller={controller}
      data={data}
      selectedRowKeys={controller.activeOpenRowKeys}
    />
  )
}

export function SourceControlPierreBranchTree({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element {
  const data = useMemo(
    () => buildBranchPierreTreeData(controller.branchTreeRoots, controller.collapsedTreeDirs),
    [controller.branchTreeRoots, controller.collapsedTreeDirs]
  )
  return (
    <SourceControlPierreTree
      controller={controller}
      data={data}
      selectedRowKeys={EMPTY_SELECTED_ROW_KEYS}
    />
  )
}
