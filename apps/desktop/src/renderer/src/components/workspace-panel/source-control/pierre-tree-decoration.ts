import type { FileTreeRowDecoration } from '@pierre/trees'

import { translate } from '../../../i18n/i18n'
import type { SourceControlController } from './controller'
import { SUBMODULE_WORKTREE_ONLY_LABEL } from './panel-constants'
import type { SourceControlPierreTarget, SourceControlPierreTreeData } from './pierre-tree-data'

type SourceControlDecorationTone = 'default' | 'added' | 'removed' | 'copied'

type SourceControlDecorationPart = {
  text: string
  tone: SourceControlDecorationTone
}

function getEntryDecorationParts(
  target: Extract<SourceControlPierreTarget, { kind: 'uncommitted' | 'branch' }>,
  commentCount: number
): SourceControlDecorationPart[] {
  const parts: SourceControlDecorationPart[] = []
  if (target.kind === 'uncommitted' && target.entry.conflictStatus) {
    parts.push({
      text:
        target.entry.conflictStatus === 'unresolved'
          ? translate('auto.components.right.sidebar.SourceControl.31f6d46278', 'Unresolved')
          : translate('auto.components.right.sidebar.SourceControl.2c417432b7', 'Resolved locally'),
      tone: 'default'
    })
  }
  if (
    target.kind === 'uncommitted' &&
    target.entry.submoduleRoot === undefined &&
    target.entry.submodule?.commitChanged === false &&
    (target.entry.submodule.trackedChanges || target.entry.submodule.untrackedChanges)
  ) {
    parts.push({ text: SUBMODULE_WORKTREE_ONLY_LABEL, tone: 'default' })
  }
  if (commentCount > 0) {
    parts.push({
      text: translate(
        'auto.components.right.sidebar.SourceControl.657e0c90ad',
        '{{value0}} note{{value1}}',
        { value0: commentCount, value1: commentCount === 1 ? '' : 's' }
      ),
      tone: 'default'
    })
  }
  if (typeof target.entry.added === 'number' && target.entry.added > 0) {
    parts.push({ text: `+${target.entry.added}`, tone: 'added' })
  }
  if (typeof target.entry.removed === 'number' && target.entry.removed > 0) {
    parts.push({ text: `-${target.entry.removed}`, tone: 'removed' })
  }
  if (target.entry.status === 'copied') {
    parts.push({ text: 'C', tone: 'copied' })
  }
  return parts
}

function getDecorationParts(
  target: SourceControlPierreTarget | undefined,
  controller: SourceControlController
): SourceControlDecorationPart[] {
  if (!target || target.kind === 'directory' || target.kind === 'placeholder') {
    return []
  }
  return getEntryDecorationParts(
    target,
    controller.diffCommentCountByPath.get(target.entry.path) ?? 0
  )
}

export function getSourceControlPierreRowDecoration(
  target: SourceControlPierreTarget | undefined,
  controller: SourceControlController
): FileTreeRowDecoration | null {
  if (target?.kind === 'placeholder') {
    return { text: '', title: target.message }
  }
  const parts = getDecorationParts(target, controller)
  const text = parts.map((part) => part.text).join('  ')
  return text ? { text, title: parts.map((part) => part.text).join(' · ') } : null
}

function syncDecorationParts(
  shadowRoot: ShadowRoot,
  data: SourceControlPierreTreeData,
  controller: SourceControlController
): void {
  for (const row of shadowRoot.querySelectorAll<HTMLElement>('[data-item-path]')) {
    const path = row.dataset.itemPath
    const content = row.querySelector<HTMLSpanElement>(
      ':scope > [data-item-section="decoration"] > span'
    )
    if (!path || !content) {
      continue
    }
    const parts = getDecorationParts(data.targetByCanonicalPath.get(path), controller)
    const signature = parts.map((part) => `${part.tone}:${part.text}`).join('|')
    if (!signature || content.dataset.yiruSourceControlDecoration === signature) {
      continue
    }

    const fragment = document.createDocumentFragment()
    parts.forEach((part, index) => {
      if (index > 0) {
        fragment.append(' ')
      }
      const partElement = document.createElement('span')
      partElement.dataset.yiruSourceControlDecorationPart = part.tone
      partElement.textContent = part.text
      fragment.append(partElement)
    })
    content.replaceChildren(fragment)
    content.dataset.yiruSourceControlDecoration = signature
  }
}

export function observeSourceControlPierreDecorations(
  host: HTMLElement,
  data: SourceControlPierreTreeData,
  controller: SourceControlController
): (() => void) | undefined {
  const shadowRoot = host.shadowRoot
  if (!shadowRoot) {
    return undefined
  }

  // Why: Pierre's public decoration renderer only accepts plain text. Split
  // that text inside its open Shadow DOM so additions and removals keep their
  // distinct source-control colors without replacing the file-tree renderer.
  const sync = () => syncDecorationParts(shadowRoot, data, controller)
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(shadowRoot, { childList: true, subtree: true })
  return () => observer.disconnect()
}
