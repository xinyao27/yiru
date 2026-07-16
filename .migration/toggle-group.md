# toggle-group

2026-07-16. Transformation engine (legacy `new-york-v4`).

## Changed
- `ui/toggle-group.tsx`: group → `@base-ui/react/toggle-group` (callable), items
  reuse `@base-ui/react/toggle`.
- Call sites (13): removed `type="single"`; `value={x}` → `value={[x]}`; handlers
  read `value[0]`.

## Left alone
- Custom `data-[variant]/[size]/[spacing]` attrs unchanged.

## Behavior changes
- `value`/`defaultValue` are arrays now; single-select preserved via `value[0]`.
  Roving focus always on (no opt-out; nothing relied on disabling it).

## Verify by hand
- Each single-select group (view switches, scope filters, kanban group-by) selects
  exactly one option.
