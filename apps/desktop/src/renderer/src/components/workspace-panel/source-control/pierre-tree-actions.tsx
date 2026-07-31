import { Minus, Trash, Plus, ArrowCounterClockwise as Undo2 } from '@phosphor-icons/react'
import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { translate } from '../../../i18n/i18n'
import { ActionButton } from './action-button'
import type { SourceControlController } from './controller'
import { getSourceControlDirectoryActionPaths } from './directory-action-paths'
import { canDiscardStatusEntry, canStageStatusEntry, canUnstageStatusEntry } from './entry-actions'
import type { SourceControlPierreTarget, SourceControlPierreTreeData } from './pierre-tree-data'

type SourceControlPierreActionHost = {
  element: HTMLElement
  path: string
}

export const SOURCE_CONTROL_PIERRE_ACTIONS_UNSAFE_CSS = `
  [data-yiru-source-control-actions] {
    position: absolute;
    inset-inline-end: calc(8px + var(--trees-git-lane-width) + var(--trees-item-row-gap));
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 2px;
    padding-inline-start: 4px;
    opacity: 0;
    pointer-events: none;
  }
  [data-type="item"]:hover + [data-yiru-source-control-actions],
  [data-type="item"]:focus + [data-yiru-source-control-actions],
  [data-yiru-source-control-actions]:hover,
  [data-yiru-source-control-actions]:focus-within {
    opacity: 1;
    pointer-events: auto;
  }
  [data-type="item"]:has(+ [data-yiru-source-control-actions]:hover),
  [data-type="item"]:has(+ [data-yiru-source-control-actions]:focus-within) {
    background-color: var(--trees-bg-muted);
    --truncate-marker-background-overlay-color: var(--trees-bg-muted);
  }
  [data-type="item"][data-item-selected="true"]:has(+ [data-yiru-source-control-actions]:hover),
  [data-type="item"][data-item-selected="true"]:has(
    + [data-yiru-source-control-actions]:focus-within
  ) {
    background-color: var(--trees-selected-bg);
    --truncate-marker-background-overlay-color: var(--trees-selected-bg);
  }
  [data-type="item"]:has(+ [data-yiru-source-control-actions]):is(:hover, :focus)
    > [data-item-section="decoration"],
  [data-type="item"]:has(+ [data-yiru-source-control-actions]:is(:hover, :focus-within))
    > [data-item-section="decoration"] {
    box-sizing: border-box;
    padding-inline-end: 54px;
  }
  [data-type="item"]:has(+ [data-yiru-source-control-actions]):is(:hover, :focus)
    > [data-item-section="decoration"]
    [data-yiru-source-control-decoration-part]:is(
      [data-yiru-source-control-decoration-part="added"],
      [data-yiru-source-control-decoration-part="removed"]
    ),
  [data-type="item"]:has(+ [data-yiru-source-control-actions]:is(:hover, :focus-within))
    > [data-item-section="decoration"]
    [data-yiru-source-control-decoration-part]:is(
      [data-yiru-source-control-decoration-part="added"],
      [data-yiru-source-control-decoration-part="removed"]
    ) {
    display: none;
  }
  @media (hover: none) {
    [data-yiru-source-control-actions] {
      opacity: 1;
      pointer-events: auto;
    }
    [data-type="item"]:has(+ [data-yiru-source-control-actions])
      > [data-item-section="decoration"] {
      box-sizing: border-box;
      padding-inline-end: 54px;
    }
    [data-type="item"]:has(+ [data-yiru-source-control-actions])
      > [data-item-section="decoration"]
      [data-yiru-source-control-decoration-part]:is(
        [data-yiru-source-control-decoration-part="added"],
        [data-yiru-source-control-decoration-part="removed"]
      ) {
      display: none;
    }
  }
`

function hasInlineActions(
  target: SourceControlPierreTarget | undefined,
  hideDirectoryActions: boolean
): boolean {
  if (target?.kind === 'uncommitted') {
    return (
      canDiscardStatusEntry(target.entry) ||
      canStageStatusEntry(target.entry) ||
      canUnstageStatusEntry(target.entry)
    )
  }
  if (target?.kind !== 'directory' || !target.node || hideDirectoryActions) {
    return false
  }
  const actionPaths = getSourceControlDirectoryActionPaths(target.node)
  return (
    actionPaths.discardPaths.length > 0 ||
    actionPaths.stagePaths.length > 0 ||
    actionPaths.unstagePaths.length > 0
  )
}

function haveSameHosts(
  current: readonly SourceControlPierreActionHost[],
  next: readonly SourceControlPierreActionHost[]
): boolean {
  return (
    current.length === next.length &&
    current.every((host, index) => host.element === next[index]?.element)
  )
}

function syncActionHosts(
  shadowRoot: ShadowRoot,
  data: SourceControlPierreTreeData,
  hideDirectoryActions: boolean
): SourceControlPierreActionHost[] {
  const activeElements = new Set<HTMLElement>()
  const hosts: SourceControlPierreActionHost[] = []
  for (const row of shadowRoot.querySelectorAll<HTMLElement>('[data-type="item"]')) {
    const path = row.dataset.itemPath
    if (!path || !hasInlineActions(data.targetByCanonicalPath.get(path), hideDirectoryActions)) {
      continue
    }
    const sibling = row.nextElementSibling
    let element: HTMLElement
    if (!(sibling instanceof HTMLElement) || sibling.dataset.yiruSourceControlActions !== path) {
      element = document.createElement('div')
      element.dataset.yiruSourceControlActions = path
      element.dataset.yiruPierreRowActions = 'true'
      row.after(element)
    } else {
      element = sibling
    }
    element.style.top = `${row.offsetTop}px`
    element.style.height = `${row.offsetHeight}px`
    activeElements.add(element)
    hosts.push({ element, path })
  }
  for (const element of shadowRoot.querySelectorAll<HTMLElement>(
    '[data-yiru-source-control-actions]'
  )) {
    if (!activeElements.has(element)) {
      element.remove()
    }
  }
  return hosts
}

function UncommittedActions({
  controller,
  target
}: {
  controller: SourceControlController
  target: Extract<SourceControlPierreTarget, { kind: 'uncommitted' }>
}): React.JSX.Element | null {
  const { entry } = target
  const canDiscard = canDiscardStatusEntry(entry)
  const canStage = canStageStatusEntry(entry)
  const canUnstage = canUnstageStatusEntry(entry)
  if (!canDiscard && !canStage && !canUnstage) {
    return null
  }
  return (
    <>
      {canDiscard ? (
        <ActionButton
          surface="row"
          icon={entry.area === 'untracked' ? Trash : Undo2}
          iconWeight={entry.area === 'untracked' ? undefined : 'regular'}
          title={
            entry.area === 'untracked'
              ? translate(
                  'auto.components.right.sidebar.SourceControl.11463f7a98',
                  'Delete untracked file'
                )
              : entry.status === 'deleted'
                ? translate(
                    'auto.components.right.sidebar.SourceControl.989f3d5e34',
                    'Restore file'
                  )
                : translate(
                    'auto.components.right.sidebar.SourceControl.d54dd48b0b',
                    'Discard changes'
                  )
          }
          onClick={(event) => {
            event.stopPropagation()
            controller.requestDiscardEntry(entry)
          }}
        />
      ) : null}
      {canStage ? (
        <ActionButton
          surface="row"
          icon={Plus}
          iconWeight="regular"
          title={translate('auto.components.right.sidebar.SourceControl.8cde1a2fb0', 'Stage')}
          onClick={(event) => {
            event.stopPropagation()
            void controller.handleStage(entry.path)
          }}
        />
      ) : null}
      {canUnstage ? (
        <ActionButton
          surface="row"
          icon={Minus}
          title={translate('auto.components.right.sidebar.SourceControl.df5040e3c3', 'Unstage')}
          onClick={(event) => {
            event.stopPropagation()
            void controller.handleUnstage(entry.path)
          }}
        />
      ) : null}
    </>
  )
}

function DirectoryActions({
  controller,
  target
}: {
  controller: SourceControlController
  target: Extract<SourceControlPierreTarget, { kind: 'directory' }>
}): React.JSX.Element | null {
  const node = target.node
  if (!node || controller.normalizedFilter) {
    return null
  }
  const actionPaths = getSourceControlDirectoryActionPaths(node)
  const canDiscard = actionPaths.discardPaths.length > 0
  const canStage = actionPaths.stagePaths.length > 0
  const canUnstage = actionPaths.unstagePaths.length > 0
  return (
    <>
      {canDiscard ? (
        <ActionButton
          surface="row"
          icon={node.area === 'untracked' ? Trash : Undo2}
          iconWeight={node.area === 'untracked' ? undefined : 'regular'}
          title={
            node.area === 'untracked'
              ? translate(
                  'auto.components.right.sidebar.SourceControl.9b367363b6',
                  'Delete untracked in folder'
                )
              : translate(
                  'auto.components.right.sidebar.SourceControl.6d7f2a47e5',
                  'Discard folder'
                )
          }
          disabled={controller.isExecutingBulk}
          onClick={(event) => {
            event.stopPropagation()
            controller.setPendingDiscard({
              kind: 'area',
              area: node.area,
              paths: actionPaths.discardPaths
            })
          }}
        />
      ) : null}
      {canStage ? (
        <ActionButton
          surface="row"
          icon={Plus}
          iconWeight="regular"
          title={translate(
            'auto.components.right.sidebar.SourceControl.bfe9011a0e',
            'Stage folder'
          )}
          disabled={controller.isExecutingBulk}
          onClick={(event) => {
            event.stopPropagation()
            void controller.handleStageAllPaths(actionPaths.stagePaths)
          }}
        />
      ) : null}
      {canUnstage ? (
        <ActionButton
          surface="row"
          icon={Minus}
          title={translate(
            'auto.components.right.sidebar.SourceControl.ab31221779',
            'Unstage folder'
          )}
          disabled={controller.isExecutingBulk}
          onClick={(event) => {
            event.stopPropagation()
            void controller.handleUnstagePaths(actionPaths.unstagePaths)
          }}
        />
      ) : null}
    </>
  )
}

function RowActions({
  controller,
  target
}: {
  controller: SourceControlController
  target: SourceControlPierreTarget | undefined
}): React.JSX.Element | null {
  if (target?.kind === 'uncommitted') {
    return <UncommittedActions controller={controller} target={target} />
  }
  if (target?.kind === 'directory') {
    return <DirectoryActions controller={controller} target={target} />
  }
  return null
}

export function SourceControlPierreTreeActions({
  controller,
  data,
  treeHostId
}: {
  controller: SourceControlController
  data: SourceControlPierreTreeData
  treeHostId: string
}): React.JSX.Element {
  const [hosts, setHosts] = useState<SourceControlPierreActionHost[]>([])

  useLayoutEffect(() => {
    const treeHost = document.getElementById(treeHostId)
    const shadowRoot = treeHost?.shadowRoot
    if (!shadowRoot) {
      return
    }
    const sync = () => {
      const nextHosts = syncActionHosts(shadowRoot, data, Boolean(controller.normalizedFilter))
      setHosts((current) => (haveSameHosts(current, nextHosts) ? current : nextHosts))
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(shadowRoot, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      for (const element of shadowRoot.querySelectorAll<HTMLElement>(
        '[data-yiru-source-control-actions]'
      )) {
        element.remove()
      }
    }
  }, [controller.normalizedFilter, data, treeHostId])

  return (
    <>
      {hosts.map(({ element, path }) =>
        createPortal(
          <RowActions controller={controller} target={data.targetByCanonicalPath.get(path)} />,
          element,
          path
        )
      )}
    </>
  )
}
