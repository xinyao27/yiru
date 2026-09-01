import DOMPurify from 'dompurify'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'

import { MarkdownCell } from './ipynb-cell-editor'
import type { IpynbCell, IpynbOutputItem } from './ipynb-types'

function valueToText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '')).join('')
  }
  if (typeof value === 'string') {
    return value
  }
  if (value === undefined || value === null) {
    return ''
  }
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
}

function dataUriForImage(item: IpynbOutputItem): string | null {
  const value = valueToText(item.value).replace(/\s/g, '')
  if (!value) {
    return null
  }
  if (item.mime === 'image/svg+xml') {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(valueToText(item.value))}`
  }
  return `data:${item.mime};base64,${value}`
}

function PreformattedOutput({
  text,
  error = false
}: {
  text: string
  error?: boolean
}): React.JSX.Element {
  return (
    <pre
      className={cn(
        'max-h-[420px] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-5 scrollbar-editor',
        error ? 'text-destructive' : 'text-foreground'
      )}
    >
      {text}
    </pre>
  )
}

function OutputItem({ item }: { item: IpynbOutputItem }): React.JSX.Element | null {
  if (item.mime === 'text/html') {
    const html = DOMPurify.sanitize(valueToText(item.value), {
      USE_PROFILES: { html: true, svg: true, svgFilters: true }
    })
    return (
      <iframe
        title={translate('auto.components.editor.IpynbViewer.66a3f7d330', 'Notebook HTML output')}
        sandbox=""
        referrerPolicy="no-referrer"
        loading="lazy"
        className="bg-background block h-80 w-full border-0 outline-none"
        srcDoc={html}
      />
    )
  }

  if (item.mime.startsWith('image/')) {
    const uri = dataUriForImage(item)
    if (!uri) {
      return null
    }
    return (
      <div className="scrollbar-editor flex max-w-full overflow-auto p-3">
        <img src={uri} alt={item.mime} className="max-h-[520px] max-w-full object-contain" />
      </div>
    )
  }

  if (item.mime === 'application/json' || item.mime.endsWith('+json')) {
    const text =
      typeof item.value === 'string' ? item.value : JSON.stringify(item.value ?? null, null, 2)
    return <PreformattedOutput text={text} />
  }

  if (item.mime === 'text/markdown') {
    return <MarkdownCell source={valueToText(item.value)} />
  }

  if (item.mime.startsWith('text/') || item.mime === 'application/javascript') {
    return <PreformattedOutput text={valueToText(item.value)} />
  }

  return null
}

export function CellOutputs({ cell }: { cell: IpynbCell }): React.JSX.Element | null {
  if (cell.outputs.length === 0) {
    return null
  }

  return (
    <div className="border-border/50 bg-background border-t">
      {cell.outputs.map((output, index) => {
        if (output.kind === 'stream') {
          return <PreformattedOutput key={index} text={output.text} />
        }
        if (output.kind === 'error') {
          return (
            <div key={index} className="border-destructive border-l-2">
              <PreformattedOutput
                error
                text={[output.name, output.message, output.traceback].filter(Boolean).join('\n')}
              />
            </div>
          )
        }
        const renderedItems = output.items
          .map((item, itemIndex) => <OutputItem key={`${item.mime}-${itemIndex}`} item={item} />)
          .filter(Boolean)
        if (renderedItems.length === 0) {
          return null
        }
        return (
          <div key={index} className="border-border/40 border-b last:border-b-0">
            {renderedItems}
          </div>
        )
      })}
    </div>
  )
}
