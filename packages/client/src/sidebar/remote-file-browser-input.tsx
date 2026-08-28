import type { ClipboardEvent, KeyboardEvent, RefObject } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { MagnifyingGlass as Search } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'

import type { RemotePathPreview } from './use-remote-path-preview'

type RemoteFileBrowserInputProps = {
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void
  preview: RemotePathPreview | null
  value: string
}

export function RemoteFileBrowserInput({
  inputRef,
  onChange,
  onKeyDown,
  onPaste,
  preview,
  value
}: RemoteFileBrowserInputProps): React.JSX.Element {
  return (
    <>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
        <Input
          ref={inputRef}
          type="text"
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          placeholder={translate(
            'auto.components.sidebar.RemoteFileBrowser.2300612806',
            'Type to filter or enter a path…'
          )}
          aria-invalid={!!preview?.error}
          aria-describedby={preview?.error ? 'remote-file-browser-path-error' : undefined}
          className={cn(
            'w-full h-7 pl-7 pr-7 text-xs bg-background',
            'border border-border outline-none focus:border-ring',
            preview?.error && 'border-destructive/60'
          )}
        />
        {preview?.loading && (
          <LoadingIndicator className="text-muted-foreground absolute top-1/2 right-2 size-3.5 -translate-y-1/2" />
        )}
      </div>
      {preview?.error && (
        <p
          id="remote-file-browser-path-error"
          role="alert"
          className="text-destructive -mt-1 px-0.5 text-[11px]"
        >
          {preview.error}
        </p>
      )}
    </>
  )
}
