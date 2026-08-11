# Yiru desktop design system

This is the binding visual contract for the Electron renderer in `packages/client/src`.
[`src/assets/main.css`](../../packages/client/src/assets/main.css) is the executable token source,
[`src/components/ui/`](../../packages/client/src/components/ui/) owns reusable primitives, and the
extended cross-client reference is [`docs/style-guide.md`](../../docs/style-guide.md).

If this document, the token source, and a component disagree, resolve the design decision first.
Do not solve the mismatch with a feature-local exception.

## 1. Product character

Yiru desktop is a dense professional workbench that frames terminals, editors, diffs, browsers,
and agent conversations. Its chrome should recede:

- grayscale-first; color communicates selection, git state, or urgency;
- square, flat, rectilinear geometry;
- opaque surfaces separated by hairlines, never elevation effects;
- compact controls with enough whitespace around the active workflow;
- stable columns and baselines across repeated rows;
- motion only when it explains state or spatial continuity.

When a choice is not covered, choose the quieter and more information-efficient result.

## 2. Source-of-truth order

Use these layers in order:

1. This document defines the desktop visual and interaction rules.
2. `src/assets/main.css` defines tokens and global renderer chrome.
3. `src/components/ui/` implements reusable primitives and their variants.
4. Domain components compose primitives in the nearest feature folder.
5. Screens arrange domain components and product behavior.

Feature code may add layout classes. It may not restyle primitive color, border, height, padding,
focus, or interaction states. Reuse a primitive, extend its CVA variant, then build a domain
composite; write colocated CSS only for host surfaces, keyframes, pseudo-elements, or Electron drag
chrome.

## 3. Foundations

### Color and surfaces

Use the semantic shadcn roles from `main.css`: `background`, `foreground`, `card`, `popover`,
`primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, and the sidebar
family.

- `background` is the main canvas; `sidebar` is panel chrome; `card` groups meaningful content;
  `popover` is only for floating content.
- `accent` is the one hover, keyboard-highlight, and neutral selection grammar.
- `primary` is the single affirmative action in a local flow, not decoration.
- Product colors are limited to their domain: git, diff, status, and graph marks.
- Floating surfaces are opaque while visible. Use a semantic surface plus `border`, not blur,
  transparency, shadow, gradient, glow, or a black/white alpha wash.
- Never hardcode a color in feature TSX or add a general-purpose token for one component.

#### Workspace theme gradient

The one sanctioned exception to grayscale-first, opaque surfaces: a user may give a workspace an
accent color and a background gradient in Settings → Appearance → Theme color. It is off until the
user picks a color, and it stays inside these bounds:

- The picked color enters the system only through `--brand`, so every `primary`/`ring` role keeps
  deriving from one hue. Features never read the gradient.
- Only `sidebar` thins out, through `--app-theme-surface-alpha`, and it is the one place the wash
  is visible. Every other surface stays opaque and takes a small hue tint (`--app-theme-tint`), so
  dialogs, menus, and editors read as themed instead of see-through over content.
- Grain and gradient are background layers on the app root only. No feature adds its own.
- The picker itself renders a color field and round color handles because it *is* the color; that
  license does not extend past `components/theme-gradient/`.

### Typography

Use the platform system UI stack and the closed renderer scale:

| Role | Utility | Use |
| --- | --- | --- |
| Body | `text-sm` | Default prose, buttons, dialogs, forms |
| Chrome | `text-xs` | Lists, menus, tabs, secondary labels |
| Metadata | `text-[11px]` | Counts, shortcuts, timestamps, trailing context |
| Micro | `text-[10px]` | Status pips and exceptional counters only |

Use mono only for paths, code, and terminal-adjacent values. Semibold is for short titles and
section labels. Truncate metadata before shrinking primary text.

### Spacing and geometry

- Desktop radius is zero. `rounded-*` is drift even when global CSS neutralizes it. A preview
  of physical hardware may use calculated radii only for the device shell and its clipped screen;
  that exception does not extend to the containing pane or its controls.
- Use the 4px spacing scale. Typical gaps are 4px inside compact metadata, 8px between sibling
  controls, 12px within a section, and 16px between regions.
- Match a primitive's named size to its surrounding row. Do not override its dimensions at the
  call site.
- Dense chrome normally uses 24 or 28px controls; ordinary actions use 32 or 36px controls.
- One-pixel semantic borders define structure. Prefer whitespace before introducing another box.
- Repeated headers and rows use fixed leading and trailing columns so titles, badges, counts, and
  disclosure controls align across the whole panel.

## 4. Application layout

- The workbench is a composition of rails, panes, and working surfaces, not a dashboard of cards.
- Sidebars own navigation and host context. The main pane owns the active terminal, editor,
  transcript, diff, or browser.
- Shared titlebar height and macOS traffic-light clearance are structural constraints. Do not place
  hit targets in the reserved traffic-light region.
- Each pane has one primary scroll owner. Do not nest full-height scroll regions or wrap host
  editors in a second scrolling component.
- That scroll owner is `ScrollArea` from `components/ui/scroll-area.tsx`. A bare `overflow-y-auto`
  container or a hand-rolled scrollbar class is drift. Surfaces that scroll themselves — terminal,
  editor, and webview guests — keep their own scrolling and are never wrapped.
- Keep working surfaces rectangular and allow them to use available space. Constrain readable prose
  rather than the terminal, editor, diff, or file tree.
- When width is scarce, remove or overflow secondary actions before reducing type or primary
  content width.

## 5. Components and interaction

- Use `Button`, `Input`, `Textarea`, `Label`, `Checkbox`, `Switch`, `Select`, and the existing
  floating primitives. Native form/action tags do not belong in feature TSX.
- Use `Tooltip` to name an icon-only action, `DropdownMenu` for an action list, `Popover` for
  arbitrary click-revealed content, and `Dialog` only for a blocking decision.
- List rows are transparent at rest, use `accent` for hover and keyboard highlight, and preserve a
  distinct persistent current state.
- Disclosure controls stay at the trailing edge of the row. Leading columns are reserved for
  identity and status.
- Focus is always visible through `ring`/`border-ring` or the documented accent treatment.
- Disable actions immediately; defer visible loading feedback until it can be perceived. Loading
  must not resize a control.
- Destructive styling is only for irreversible actions. Cancel, Close, Dismiss, and Back stay quiet.
- Use Phosphor icons through the shared renderer conventions. Do not add another icon language.

## 6. Platform, accessibility, and motion

- Keyboard labels and bindings use `CmdOrCtrl` semantics and display platform-correct glyphs.
- Every action is keyboard reachable; icon-only controls have an accessible name and tooltip.
- Status is expressed with text or a symbol in addition to color.
- Verify light and dark mode, macOS/Windows/Linux chrome, reduced motion, long labels, and remote
  latency.
- Motion clarifies expansion, navigation, and state changes. Do not animate persistent working
  surfaces or add decorative idle motion.

## 7. Verification checklist

Before finishing a desktop visual change, check:

1. Is the correct primitive used without call-site restyling?
2. Are colors semantic and surfaces opaque?
3. Are radius, shadow, blur, gradient, and alpha-wash drift absent?
4. Do repeated rows share leading, content, and trailing alignment?
5. Is there one scroll owner per pane and stable space for loading states?
6. Are focus, keyboard behavior, accessible names, and platform shortcuts correct?
7. Does the change work in both themes and at narrow desktop widths?
8. If a new rule was necessary, were this document and the owning primitive/token updated first?
