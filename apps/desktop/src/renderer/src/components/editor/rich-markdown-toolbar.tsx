import {
  TextHOne as Heading1,
  TextHTwo as Heading2,
  TextHThree as Heading3,
  TextHFour as Heading4,
  TextHFive as Heading5,
  ImageIcon,
  Link as LinkIcon,
  List,
  ListNumbers as ListOrdered,
  ListChecks as ListTodo,
  DotsThree as MoreHorizontal,
  Paragraph as Pilcrow,
  Quotes as Quote,
  CaretRight as ChevronRight
} from '@phosphor-icons/react'
import type { Editor } from '@tiptap/react'
import React from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { insertToggle } from './rich-markdown-slash-command-primitives'
import { RichMarkdownToolbarButton } from './rich-markdown-toolbar-button'

// Why: the GitHub markdown composer reuses this toolbar in two denser
// contexts (a standalone comment box and a tabbed write/preview pane) that
// need less padding and a quieter background than the full editor's chrome
// row — an explicit variant beats a CSS descendant override reaching across
// two unrelated feature folders.
type RichMarkdownToolbarVariant = 'standalone' | 'composer' | 'composer-tabbed'

const TOOLBAR_VARIANT_CLASS_NAMES: Record<RichMarkdownToolbarVariant, string> = {
  standalone: 'min-h-10 px-3.5 py-1.5 bg-[color-mix(in_srgb,var(--background)_84%,transparent)]',
  composer: 'min-h-10 px-2 py-1.5 bg-[color-mix(in_srgb,var(--background)_92%,transparent)]',
  'composer-tabbed': 'min-h-[38px] px-2 py-1 bg-transparent'
}

type RichMarkdownToolbarProps = {
  editor: Editor | null
  onToggleLink: () => void
  onImagePick: () => void
  variant?: RichMarkdownToolbarVariant
}

function Separator(): React.JSX.Element {
  return (
    <div className="h-[18px] w-px shrink-0 bg-[color-mix(in_srgb,var(--border)_72%,transparent)]" />
  )
}

function RichMarkdownMoreBlocksMenu({ editor }: { editor: Editor | null }): React.JSX.Element {
  const label = translate('auto.components.editor.RichMarkdownToolbar.91a843fb43', 'More blocks')

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="quiet"
                    size="xs"
                    type="button"
                    className="inline-flex h-7 w-auto min-w-7 shrink-0 items-center justify-center border border-transparent px-2 hover:border-[color-mix(in_srgb,var(--border)_82%,transparent)]"
                    aria-label={label}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="bottom" sideOffset={4}>
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" side="bottom">
        <DropdownMenuLabel>
          {translate('auto.components.editor.RichMarkdownToolbar.2cd9e0bbb3', 'Headings')}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()}>
          <Heading4 className="size-3.5" />
          {translate('auto.components.editor.RichMarkdownToolbar.b05e14620d', 'Heading 4')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor?.chain().focus().toggleHeading({ level: 5 }).run()}>
          <Heading5 className="size-3.5" />
          {translate('auto.components.editor.RichMarkdownToolbar.6bbf827ef5', 'Heading 5')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => (editor ? insertToggle(editor) : undefined)}>
          <ChevronRight weight="regular" className="size-3.5" />
          {translate(
            'auto.components.editor.RichMarkdownToolbar.d1bbf9a835',
            'Collapsible section'
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function RichMarkdownToolbar({
  editor,
  onToggleLink,
  onImagePick,
  variant = 'standalone'
}: RichMarkdownToolbarProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5',
        'border-b border-[color-mix(in_srgb,var(--border)_72%,transparent)]',
        // Why: on a narrow panel the fixed-size buttons would otherwise spill past
        // the chrome row and overlap neighboring content; scroll like the tab
        // strips instead of wrapping, which would break the TOC header's
        // shared-row alignment. The bracket variants hide the scrollbar itself.
        'overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0',
        TOOLBAR_VARIANT_CLASS_NAMES[variant]
      )}
    >
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.b462641ed2', 'Body text')}
        onClick={() => editor?.chain().focus().setParagraph().run()}
      >
        <Pilcrow className="size-3.5" />
      </RichMarkdownToolbarButton>
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.abb5100a3d', 'Heading 1')}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="size-3.5" />
      </RichMarkdownToolbarButton>
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.d34a2021c8', 'Heading 2')}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-3.5" />
      </RichMarkdownToolbarButton>
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.cf5817d827', 'Heading 3')}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-3.5" />
      </RichMarkdownToolbarButton>
      <Separator />
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.4f9e789fe0', 'Bold')}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        B
      </RichMarkdownToolbarButton>
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.6b4ccf9493', 'Italic')}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        I
      </RichMarkdownToolbarButton>
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.0bea19a988', 'Strike')}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      >
        S
      </RichMarkdownToolbarButton>
      <Separator />
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.5d1539e5a9', 'Bullet list')}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List className="size-3.5" />
      </RichMarkdownToolbarButton>
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.31630ed66e', 'Numbered list')}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-3.5" />
      </RichMarkdownToolbarButton>
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.f97031be09', 'Checklist')}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      >
        <ListTodo className="size-3.5" />
      </RichMarkdownToolbarButton>
      <Separator />
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.f6a51cb9af', 'Quote')}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-3.5" />
      </RichMarkdownToolbarButton>
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.6d52624712', 'Link')}
        onClick={onToggleLink}
      >
        <LinkIcon className="size-3.5" />
      </RichMarkdownToolbarButton>
      <RichMarkdownToolbarButton
        active={false}
        label={translate('auto.components.editor.RichMarkdownToolbar.e935c6b61e', 'Image')}
        onClick={onImagePick}
      >
        <ImageIcon className="size-3.5" />
      </RichMarkdownToolbarButton>
      <RichMarkdownMoreBlocksMenu editor={editor} />
    </div>
  )
}
