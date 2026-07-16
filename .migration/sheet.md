# sheet

2026-07-16. Transformation engine (legacy `new-york-v4`). Dialog primitive, side slides.

## Changed
- `ui/sheet.tsx`: → `@base-ui/react/dialog`; `Overlay`→`Backdrop`, `Content`→`Popup`;
  per-side slide rewritten to `data-starting-style`/`data-ending-style` translates
  keyed on each `side` (300ms open / 200ms close preserved).
- Call sites: SheetContent `onOpenAutoFocus`→`initialFocus`; VisuallyHidden titles →
  `className="sr-only"`.

## Left alone
- Side variants and sizing classes unchanged.

## Behavior changes
- Same dismiss/focus model change as dialog.

## Verify by hand
- Open issue drawers (Jira/Linear/GitLab/GitHub project): slides in from the right
  side, has an (sr-only) title, no focus steal where autofocus was prevented.
