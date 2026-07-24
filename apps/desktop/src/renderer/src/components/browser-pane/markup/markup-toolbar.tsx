import {
  Circle,
  Highlighter,
  Pencil,
  Square,
  Trash as Trash2,
  TextT as Type,
  ArrowUpRight,
  ArrowClockwise as Redo2,
  ArrowCounterClockwise as Undo2,
  type IconProps
} from '@phosphor-icons/react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import {
  MARKUP_COLORS,
  MARKUP_FONT_SIZES,
  MARKUP_WIDTHS,
  type MarkupTool
} from './markup-drawing-model'

type ToolItem = {
  kind: MarkupTool
  icon: React.ComponentType<IconProps>
  iconWeight?: IconProps['weight']
  label: string
}

function toolItems(): ToolItem[] {
  return [
    {
      kind: 'pen',
      icon: Pencil,
      label: translate('auto.components.browser-pane.markup.tool.pen', 'Pen')
    },
    {
      kind: 'highlight',
      icon: Highlighter,
      label: translate('auto.components.browser-pane.markup.tool.highlight', 'Highlighter')
    },
    {
      kind: 'arrow',
      icon: ArrowUpRight,
      iconWeight: 'regular',
      label: translate('auto.components.browser-pane.markup.tool.arrow', 'Arrow')
    },
    {
      kind: 'rect',
      icon: Square,
      label: translate('auto.components.browser-pane.markup.tool.rect', 'Rectangle')
    },
    {
      kind: 'ellipse',
      icon: Circle,
      label: translate('auto.components.browser-pane.markup.tool.ellipse', 'Ellipse')
    },
    {
      kind: 'text',
      icon: Type,
      label: translate('auto.components.browser-pane.markup.tool.text', 'Text')
    }
  ]
}

export type MarkupToolbarProps = {
  tool: MarkupTool
  onToolChange: (tool: MarkupTool) => void
  color: string
  onColorChange: (color: string) => void
  width: number
  onWidthChange: (width: number) => void
  fontSize: number
  onFontSizeChange: (fontSize: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}

export const MarkupToolbar = React.memo(function MarkupToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  width,
  onWidthChange,
  fontSize,
  onFontSizeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear
}: MarkupToolbarProps) {
  return (
    <TooltipProvider delay={300}>
      <div className="border-border bg-card flex items-center gap-1 border px-1.5 py-1">
        {toolItems().map((item) => (
          <IconButton
            key={item.kind}
            label={item.label}
            active={tool === item.kind}
            onClick={() => onToolChange(item.kind)}
          >
            <item.icon className="size-4" weight={item.iconWeight} />
          </IconButton>
        ))}

        <Divider />

        <Popover>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={translate(
                        'auto.components.browser-pane.markup.style',
                        'Color and thickness'
                      )}
                    >
                      <span
                        className="border-border size-4 border"
                        style={{ backgroundColor: color }}
                      />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.browser-pane.markup.style', 'Color and thickness')}
            </TooltipContent>
          </Tooltip>
          <PopoverContent side="top" align="start" className="w-auto p-2">
            <div className="flex flex-wrap gap-1">
              {MARKUP_COLORS.map((swatch) => (
                <Button
                  variant="outline"
                  size="icon-xs"
                  key={swatch}
                  type="button"
                  aria-label={swatch}
                  onClick={() => onColorChange(swatch)}
                  className={cn(
                    'focus-visible:bg-accent',
                    '',
                    color === swatch ? 'border-ring' : ''
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1">
              {MARKUP_WIDTHS.map((option) => (
                <Button
                  variant="outline"
                  size="xs"
                  key={option}
                  type="button"
                  aria-label={translate(
                    'auto.components.browser-pane.markup.widthOption',
                    '{{value0}} px',
                    { value0: option }
                  )}
                  onClick={() => onWidthChange(option)}
                  className={cn(
                    'p-0 focus-visible:bg-accent',
                    'flex flex-1',
                    width === option ? 'border-ring bg-accent' : ''
                  )}
                >
                  <span
                    className="bg-foreground"
                    style={{ width: option + 2, height: option + 2 }}
                  />
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 px-2"
                      aria-label={translate(
                        'auto.components.browser-pane.markup.fontSize',
                        'Font size'
                      )}
                    >
                      <Type className="size-3.5" />
                      <span className="text-[11px] tabular-nums">{fontSize}</span>
                    </Button>
                  }
                />
              }
            />
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.browser-pane.markup.fontSize', 'Font size')}
            </TooltipContent>
          </Tooltip>
          <PopoverContent side="top" align="start" className="w-auto p-2">
            <div className="flex items-center gap-1">
              {MARKUP_FONT_SIZES.map((size) => (
                <Button
                  variant="outline"
                  size="xs"
                  key={size}
                  type="button"
                  aria-label={translate(
                    'auto.components.browser-pane.markup.widthOption',
                    '{{value0}} px',
                    { value0: size }
                  )}
                  onClick={() => onFontSizeChange(size)}
                  className={cn(
                    'focus-visible:bg-accent',
                    'flex min-w-7 px-1 text-[11px] tabular-nums',
                    fontSize === size ? 'border-ring bg-accent' : ''
                  )}
                >
                  {size}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Divider />

        <IconButton
          label={translate('auto.components.browser-pane.markup.undo', 'Undo')}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 weight="regular" className="size-4" />
        </IconButton>
        <IconButton
          label={translate('auto.components.browser-pane.markup.redo', 'Redo')}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 weight="regular" className="size-4" />
        </IconButton>
        <IconButton
          label={translate('auto.components.browser-pane.markup.clear', 'Clear all')}
          disabled={!canUndo && !canRedo}
          onClick={onClear}
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </TooltipProvider>
  )
})

function Divider(): React.JSX.Element {
  return <span className="bg-border mx-0.5 h-5 w-px" aria-hidden />
}

type IconButtonProps = {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children
}: IconButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={active ? 'default' : 'ghost'}
            size="icon-sm"
            disabled={disabled}
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
