import CommentMarkdown from '@/components/sidebar/comment-markdown'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { GitHubOwnerRepo } from '../../../../shared/types'

export function GitHubMarkdownComposerPreviewPane({
  value,
  minHeightClassName,
  previewGithubRepo
}: {
  value: string
  minHeightClassName: string
  previewGithubRepo: GitHubOwnerRepo | null
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'github-markdown-composer-preview scrollbar-sleek max-h-[360px] overflow-y-auto',
        minHeightClassName
      )}
    >
      {value.trim() ? (
        <CommentMarkdown
          content={value}
          variant="document"
          githubRepo={previewGithubRepo}
          className="max-w-full min-w-0 overflow-hidden text-[13px] leading-relaxed break-words [&_a]:break-all [&_code]:break-words [&_pre]:max-w-full"
        />
      ) : (
        <p className="text-muted-foreground text-[13px] italic">
          {translate(
            'auto.components.github.GitHubMarkdownComposer.8f1c2d4e6a',
            'Nothing to preview'
          )}
        </p>
      )}
    </div>
  )
}
