import { CONTEXT_MENU_TRIGGER_TYPE } from '@pierre/trees'
import { FileTree, useFileTree } from '@pierre/trees/react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { joinPath } from '../../../lib/path'
import { WORKSPACE_FILE_PATH_MIME } from '../../../lib/workspace-file-drag'
import { PIERRE_FILE_TREE_STYLE, PIERRE_FILE_TREE_UNSAFE_CSS } from '../pierre-file-tree-theme'
import type { SourceControlController } from './controller'
import {
  buildBranchPierreTreeData,
  buildUncommittedPierreTreeData,
  type SourceControlPierreTarget,
  type SourceControlPierreTreeData
} from './pierre-tree-data'
import { getSourceControlPierreRowDecoration } from './pierre-tree-decoration'
import { SourceControlPierreTreeMenu } from './pierre-tree-menu'
import type { SourceControlDisplaySectionId } from './section-order'
import { toPermanentSourceControlRowOpenEvent } from './split-open'
import { getSubmoduleExpansionKey } from './submodule-expansion'

const SOURCE_CONTROL_PIERRE_TREE_ROW_HEIGHT_PX = 26

// Why: the working-tree groups are the tree's top level but live outside
// Pierre's path model (a synthetic group directory would be folded into a
// sole-child directory chain), so their rows get Pierre's one-level indent
// applied to the row padding — the row background still spans the full width.
const SOURCE_CONTROL_PIERRE_TREE_NESTED_UNSAFE_CSS = `
  [data-type="item"] {
    padding-left: calc(var(--trees-item-padding-x) + var(--trees-icon-width));
  }
`

const SOURCE_CONTROL_PIERRE_TREE_UNSAFE_CSS = `${PIERRE_FILE_TREE_UNSAFE_CSS}
  /* Why: the source-control panel owns scrolling, so Pierre must not reserve
     an internal scrollbar gutter that shortens every row. */
  [data-file-tree-virtualized-scroll="true"] {
    overflow: visible !important;
    scrollbar-gutter: auto !important;
  }
  [data-item-section="decoration"] + [data-item-section="git"] {
    margin-left: -2px;
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
  selectedRowKeys,
  nested = false
}: {
  controller: SourceControlController
  data: SourceControlPierreTreeData
  selectedRowKeys: ReadonlySet<string>
  nested?: boolean
}): React.JSX.Element {
  const treeHostId = useId()
  const [visibleRowCount, setVisibleRowCount] = useState(1)
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
      // Why: Pierre's own trigger-button lane is the only per-row action
      // affordance its API exposes, so stage/unstage/discard live in this one
      // menu instead of buttons injected into its shadow DOM.
      contextMenu: { enabled: true, triggerMode: 'both', buttonVisibility: 'when-needed' }
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
      getSourceControlPierreRowDecoration(
        callbacksRef.current.data.targetByCanonicalPath.get(item.path),
        callbacksRef.current.controller
      ),
    unsafeCSS: nested
      ? `${SOURCE_CONTROL_PIERRE_TREE_UNSAFE_CSS}${SOURCE_CONTROL_PIERRE_TREE_NESTED_UNSAFE_CSS}`
      : SOURCE_CONTROL_PIERRE_TREE_UNSAFE_CSS
  })
  useLayoutEffect(() => {
    resettingRef.current = true
    model.resetPaths(data.paths, { initialExpandedPaths: data.expandedPaths })
    const expandedPaths = new Set(data.expandedPaths)
    for (const path of data.targetByCanonicalPath.keys()) {
      const item = model.getItem(path)
      if (!item || !('isExpanded' in item) || item.isExpanded() === expandedPaths.has(path)) {
        continue
      }
      // Why: the panel height follows controlled collapse state, so Pierre's
      // disclosure state must match it immediately after a path reset.
      if (expandedPaths.has(path)) {
        item.expand()
      } else {
        item.collapse()
      }
    }
    resettingRef.current = false
    setVisibleRowCount(model.getVisibleCount())
  }, [data.expandedPaths, data.paths, data.targetByCanonicalPath, model])

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
        // Why: Pierre owns the projected row count (sole-child directory chains
        // collapse into one row), so the panel height follows its own tally.
        setVisibleRowCount(model.getVisibleCount())
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

  // Why: every source-control group shares the panel scroller; sizing the tree
  // to all visible rows prevents each group from gaining its own scroll.
  const height = Math.max(1, visibleRowCount) * SOURCE_CONTROL_PIERRE_TREE_ROW_HEIGHT_PX

  return (
    <FileTree
      id={treeHostId}
      model={model}
      className="yiru-pierre-file-tree bg-sidebar block w-full shrink-0"
      style={{ ...PIERRE_FILE_TREE_STYLE, height }}
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
      renderContextMenu={(item, context) => {
        const target = data.targetByCanonicalPath.get(item.path)
        return target ? (
          <SourceControlPierreTreeMenu controller={controller} target={target} context={context} />
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
      nested
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
