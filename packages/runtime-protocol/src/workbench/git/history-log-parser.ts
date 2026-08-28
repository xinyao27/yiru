import type { GitHistoryItem, GitHistoryItemRef } from '@yiru/runtime-protocol/model/review'

const GIT_HISTORY_DECORATION_SEPARATOR = '\x1f'

// Why: `%(decorate:...)` lets the decoration field use a control-character
// separator, which real ref names cannot contain — Git ref names permit
// commas, so a comma-joined decoration string is ambiguous. This modifier
// needs Git 2.34+; `GIT_HISTORY_COMMIT_FORMAT_FALLBACK` (plain `%D`, comma
// joined) covers the 2.25 baseline and is why the parser below accepts
// either separator style.
export const GIT_HISTORY_COMMIT_FORMAT = buildGitHistoryCommitFormat(
  '%(decorate:prefix=,suffix=,separator=%x1f)'
)
export const GIT_HISTORY_COMMIT_FORMAT_FALLBACK = buildGitHistoryCommitFormat('%D')

function buildGitHistoryCommitFormat(decorateField: string): string {
  return `%H%n%aN%n%aE%n%at%n%ct%n%P%n${decorateField}%n%B`
}

export function shortGitHash(hash: string): string {
  return hash.slice(0, 7)
}

function commitSubject(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim()
  return firstLine || '(no commit message)'
}

// Why: `refs/remotes/<remote>/<branch>` normally has a branch component, but
// a bare `refs/remotes/<remote>` (no slash left) is a valid ref name too —
// `indexOf('/')` returning -1 must not silently become a truncated name via
// `slice(0, -1)`.
function remoteNameFromQualifiedName(remoteQualifiedName: string): string | undefined {
  const separatorIndex = remoteQualifiedName.indexOf('/')
  return separatorIndex === -1 ? undefined : remoteQualifiedName.slice(0, separatorIndex)
}

function parseGitDecorationRefs(raw: string, revision: string): GitHistoryItemRef[] {
  if (!raw.trim()) {
    return []
  }

  const refs: GitHistoryItemRef[] = []
  // Why: Git permits commas in ref names, so Yiru's git log format uses a
  // control-character separator that Git ref names cannot contain.
  const parts = raw.includes(GIT_HISTORY_DECORATION_SEPARATOR)
    ? raw.split(GIT_HISTORY_DECORATION_SEPARATOR)
    : raw.split(',')

  for (const part of parts) {
    const ref = part.trim()
    // Why: a remote's own HEAD symref (`refs/remotes/origin/HEAD`) points at
    // whichever branch that remote treats as default — it is metadata about
    // the remote, not a real branch tip, so it is never a useful decoration.
    if (!ref || /^refs\/remotes\/[^/]+\/HEAD(?:\s|$)/.test(ref)) {
      continue
    }

    if (ref === 'HEAD') {
      // Why: detached HEAD decorates the commit as a bare "HEAD" with no
      // "-> refs/heads/..." arrow — surface it as its own ref kind so a
      // graph UI can badge "HEAD" even when it is not on a branch.
      refs.push({ id: 'HEAD', name: 'HEAD', revision, category: 'head' })
      continue
    }

    if (ref.startsWith('HEAD -> refs/heads/')) {
      const branchRefId = ref.slice('HEAD -> '.length)
      refs.push({ id: 'HEAD', name: 'HEAD', revision, category: 'head' })
      refs.push({
        id: branchRefId,
        name: branchRefId.slice('refs/heads/'.length),
        revision,
        category: 'branches',
        isCheckedOut: true
      })
      continue
    }

    if (ref.startsWith('refs/heads/')) {
      refs.push({
        id: ref,
        name: ref.slice('refs/heads/'.length),
        revision,
        category: 'branches'
      })
      continue
    }

    if (ref.startsWith('refs/remotes/')) {
      const remoteQualifiedName = ref.slice('refs/remotes/'.length)
      const remoteName = remoteNameFromQualifiedName(remoteQualifiedName)
      refs.push({
        id: ref,
        name: remoteQualifiedName,
        revision,
        category: 'remote branches',
        ...(remoteName ? { remoteName } : {})
      })
      continue
    }

    if (ref.startsWith('tag: refs/tags/')) {
      refs.push({
        id: ref.slice('tag: '.length),
        name: ref.slice('tag: refs/tags/'.length),
        revision,
        category: 'tags'
      })
    }
  }

  return refs.sort(compareGitHistoryItemRefsByCategory)
}

export function compareGitHistoryItemRefsByCategory(
  ref1: GitHistoryItemRef,
  ref2: GitHistoryItemRef
): number {
  const order = (ref: GitHistoryItemRef): number => {
    if (ref.category === 'head') {
      return 0
    }
    if (ref.category === 'branches' || ref.id.startsWith('refs/heads/')) {
      return 1
    }
    if (ref.category === 'remote branches' || ref.id.startsWith('refs/remotes/')) {
      return 2
    }
    if (ref.category === 'tags' || ref.id.startsWith('refs/tags/')) {
      return 3
    }
    return 99
  }

  const categoryOrder = order(ref1) - order(ref2)
  return categoryOrder || ref1.name.localeCompare(ref2.name)
}

export function parseGitHistoryLog(stdout: string): GitHistoryItem[] {
  const items: GitHistoryItem[] = []
  for (const rawRecord of stdout.split('\0')) {
    const record = rawRecord.replace(/^\n+/, '')
    if (!record.trim()) {
      continue
    }

    const lines = record.split('\n')
    const hash = lines[0]?.trim() ?? ''
    if (!/^[0-9a-fA-F]{40,64}$/.test(hash)) {
      continue
    }

    const authorName = lines[1] ?? ''
    const authorEmail = lines[2] ?? ''
    const authorDateSeconds = Number.parseInt(lines[3] ?? '', 10)
    const parents = (lines[5] ?? '').trim()
    const decorations = lines[6] ?? ''
    const message = lines.slice(7).join('\n').replace(/\n$/, '')

    items.push({
      id: hash,
      parentIds: parents ? parents.split(' ') : [],
      subject: commitSubject(message),
      message,
      author: authorName || undefined,
      authorEmail: authorEmail || undefined,
      displayId: shortGitHash(hash),
      timestamp: Number.isFinite(authorDateSeconds) ? authorDateSeconds * 1000 : undefined,
      references: parseGitDecorationRefs(decorations, hash)
    })
  }
  return items
}

export function gitHistoryRefFromFullName(
  fullName: string | null,
  fallbackName: string,
  revision: string
): GitHistoryItemRef {
  const id = fullName || fallbackName
  if (id.startsWith('refs/heads/')) {
    return { id, name: id.slice('refs/heads/'.length), revision, category: 'branches' }
  }
  if (id.startsWith('refs/remotes/')) {
    const remoteQualifiedName = id.slice('refs/remotes/'.length)
    const remoteName = remoteNameFromQualifiedName(remoteQualifiedName)
    return {
      id,
      name: remoteQualifiedName,
      revision,
      category: 'remote branches',
      ...(remoteName ? { remoteName } : {})
    }
  }
  if (id.startsWith('refs/tags/')) {
    return { id, name: id.slice('refs/tags/'.length), revision, category: 'tags' }
  }
  return { id, name: fallbackName || shortGitHash(revision), revision, category: 'commits' }
}
