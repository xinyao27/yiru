import { CaretDown } from '@phosphor-icons/react'
import { cn } from 'cnfast'
import { useEffect, useId, useRef, useState } from 'react'

export type DownloadOption = {
  label: string
  href: string
}

export type DownloadMenuProps = {
  label: string
  options: DownloadOption[]
}

/**
 * Why: a plain trigger with a popover rather than a styled `<select>` — the
 * boxed control read as a form field on a page that has none. The items stay
 * real links so cmd-click and middle-click still work, and the menu closes on
 * Escape or an outside press.
 */
export function DownloadMenu({ label, options }: DownloadMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors',
          open ? 'text-accent' : 'text-ink hover:text-accent'
        )}
      >
        {label}
        <CaretDown
          className={cn('size-2.5 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <span
          id={menuId}
          role="menu"
          className="border-rule bg-page rounded-card shadow-soft absolute top-full left-0 z-30 mt-1.5 flex min-w-[140px] flex-col py-1"
        >
          {options.map((option) => (
            <a
              key={option.href}
              role="menuitem"
              href={option.href}
              onClick={() => setOpen(false)}
              className="text-copy hover:bg-raised hover:text-ink px-3 py-1.5 text-[12px] whitespace-nowrap transition-colors"
            >
              {option.label}
            </a>
          ))}
        </span>
      ) : null}
    </span>
  )
}
