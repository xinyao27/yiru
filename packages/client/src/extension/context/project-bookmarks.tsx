import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { Bookmark } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import {
  type BrowserProjectBookmarkKind,
  getExtensionBrowserCapabilities
} from '../browser-capabilities'
import { getExtensionHostNavigation } from '../navigation'

const BOOKMARK_KINDS = ['pr', 'staging', 'dashboard', 'docs'] as const

export type ProjectBookmarksProps = {
  displayName: string
  pageUrl: string
  projectId: string
}

export function ProjectBookmarks({
  displayName,
  pageUrl,
  projectId
}: ProjectBookmarksProps): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const navigation = getExtensionHostNavigation()
  const queryClient = useQueryClient()
  const queryKey = ['extension-host', 'project-bookmarks', projectId] as const
  const bookmarks = useQuery({
    queryKey,
    queryFn: async () => capabilities.readProjectBookmarks({ displayName, projectId })
  })
  const save = useMutation({
    mutationFn: async (kind: BrowserProjectBookmarkKind) =>
      capabilities.saveProjectBookmarks({
        displayName,
        links: [
          ...(bookmarks.data?.links ?? []).filter((link) => link.kind !== kind),
          { kind, url: pageUrl }
        ],
        projectId
      }),
    onSuccess: (links) => queryClient.setQueryData(queryKey, { enabled: true, links })
  })
  return (
    <div className="border-sidebar-border/70 mt-1 border-t px-1 pt-2">
      <p className="text-muted-foreground text-xs">
        {translate(
          'extension.bookmarks.description',
          'Keep this page in the project bookmark folder'
        )}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {BOOKMARK_KINDS.map((kind) => (
          <Button
            key={kind}
            type="button"
            size="xs"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => save.mutate(kind)}
          >
            <Bookmark className="size-3.5" />
            {translate('extension.bookmarks.saveAs', 'Save as {{kind}}', {
              kind: bookmarkKindLabel(kind)
            })}
          </Button>
        ))}
      </div>
      {(bookmarks.data?.links ?? []).length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {(bookmarks.data?.links ?? []).map((link) => (
            <Button
              key={link.kind}
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void navigation.openExternalUrl({ projectId, url: link.url })}
            >
              {bookmarkKindLabel(link.kind)}
            </Button>
          ))}
        </div>
      ) : null}
      {save.isError ? (
        <p className="text-destructive mt-1 text-xs">
          {translate(
            'extension.bookmarks.failed',
            'The bookmark could not be saved. Chrome may still need permission.'
          )}
        </p>
      ) : null}
    </div>
  )
}

function bookmarkKindLabel(kind: BrowserProjectBookmarkKind): string {
  switch (kind) {
    case 'pr':
      return translate('extension.bookmarks.pullRequest', 'pull request')
    case 'staging':
      return translate('extension.bookmarks.staging', 'staging')
    case 'dashboard':
      return translate('extension.bookmarks.dashboard', 'dashboard')
    case 'docs':
      return translate('extension.bookmarks.documentation', 'documentation')
  }
}
