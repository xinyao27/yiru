# Yiru UI Style Guide

This is the **UI/visual design** doc for Yiru — how to choose components, tokens, typography, and UX behavior. It is _not_ an architecture doc. Token values live in `apps/desktop/src/renderer/src/assets/main.css` (canonical). The reusable component inventory lives in [`components/ui/README.md`](../apps/desktop/src/renderer/src/components/ui/README.md).

## First principle: reuse `@/components/ui`

**Before writing a native control or hand-rolled class recipe, use a primitive from `apps/desktop/src/renderer/src/components/ui/`.**

Import from the module (`@/components/ui/button`), not a barrel. Screens compose rendered primitives; they do not reimplement Base UI focus/keyboard behavior, and they do not import private recipe files such as `floating-surface-styles.ts` or `menu-item-styles.ts`.

CI enforces the contract via `apps/desktop/config/scripts/check-ui-style-drift.mjs` (wired into `verify:repository-contracts`): no feature-TSX native `<button>`/`<input>`/`<textarea>`/`<select>` outside the documented allowlist, no dead `rounded-*`, no black/white alpha interactive washes, and no private ui style imports. Button classNames that look like the old quiet/`sidebar-accent` stacks warn today and may ratchet to errors later.

### Decision fork

When building UI, resolve in this order:

1. **Reuse** the nearest primitive (`Button`, `Input`, `Switch`, `Select`, `Dialog`, `DropdownMenu`, `ContextMenu`, `Tabs`, `Badge`, …). Match with `variant` and `size` props.
2. **Extend the primitive** (add a CVA `variant` or `size` in `components/ui/`) when the same exception would appear more than once at call sites.
3. **Domain composite** in the feature folder when the control needs product data/copy (e.g. repo combobox) but still composes primitives for chrome.
4. **Colocated CSS** only for host surfaces (Monaco, xterm, markdown), keyframes, pseudo-elements, or Electron drag chrome — never as an escape hatch for buttons and forms.

### Compose, don't restyle

Call sites may add **layout** classes: placement, flex behavior, `w-full`, stacking. They must not re-specify color, hover/focus, height, padding, or icon size already owned by `variant` / `size`.

If you find yourself adding `bg-*`, `text-*`, `border-*`, `hover:*`, `focus-*`, `dark:*`, fixed `h-*` / `w-*` / `size-*`, or padding utilities to a primitive's `className`, stop: extend the primitive instead.

## Visual identity

Yiru is an Electron desktop app for orchestrating coding agents across git worktrees. The visual identity is **monochrome and quiet** — neutral grays carry the chrome; color is reserved for state (selection, destructive, git decorations). The product hosts other tools (Monaco, xterm, Markdown), so Yiru's own UI should recede and frame.

After the ui-first fork, when still choosing paint:

- Reach for **muted / accent / border** before color.
- Reach for **existing shadcn roles or Tailwind palette colors** before hardcoding hex.

## Source of truth

| Concern | Canonical location |
| --- | --- |
| Component primitives | `apps/desktop/src/renderer/src/components/ui/` |
| Component catalog and ownership | [`components/ui/README.md`](../apps/desktop/src/renderer/src/components/ui/README.md) |
| Color tokens | `apps/desktop/src/renderer/src/assets/main.css` (`:root`, `.dark`) |
| Tailwind theme bindings | Same file, `@theme inline { … }` block |
| App typography / scrollbars / titlebar chrome | Same `main.css` |

### Token budget

The shadcn token set is the default closed vocabulary: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart`, and `sidebar`, with their foreground pairs. Reuse these before considering another variable.

- Use Tailwind's built-in palette for ordinary state color (`green-*` for success, `amber-*` for warning). Do not create aliases such as `status-success`, `warning`, or a token for one component.
- Do not create separate tokens for hover, selected, modal, menu, or floating borders. Those are compositions of the default roles.
- A custom token is reserved for stable product-domain semantics that cannot be expressed by a default role, such as git decorations or an editor surface shared with embedded editors.
- Keep custom CSS variables out of `@theme inline`. If JSX truly needs a Tailwind utility for a product-domain exception, treat that as an explicit token-budget change rather than adding it inside a feature task.
- Before adding a custom token, check for an existing default role, a Tailwind palette color, and `color-mix`. If none works, ask rather than expanding the theme implicitly.

Never hardcode a hex value in TSX. Reusable product-domain colors belong in `main.css`; ordinary colors use Tailwind's built-in palette, while truly surface-local CSS stays scoped to its owning stylesheet.

## Color roles

Tokens come in pairs: a **surface** and a **foreground** that meets contrast on it. Always use them together.

| Role | Use it for | Don't use it for |
| --- | --- | --- |
| `background` / `foreground` | App canvas, default text | Cards, popovers, sidebar (have their own) |
| `card` / `card-foreground` | Panels lifted off the canvas | The canvas itself |
| `popover` / `popover-foreground` | Floating menus, dropdowns, hovercards | Inline UI |
| `primary` / `primary-foreground` | The single affirmative action in a flow (Save, Confirm) | Decorative accents; hover states; secondary actions |
| `secondary` / `secondary-foreground` | Lower-emphasis actions next to a primary | The affirmative action |
| `muted` / `muted-foreground` | De-emphasized text, captions, placeholders, disabled chrome | Body copy; primary actions |
| `accent` / `accent-foreground` | Hover/active backgrounds for ghost buttons and list rows | Solid filled buttons (use `secondary` instead) |
| `destructive` / `destructive-foreground` | Delete, discard, irreversible-action buttons; error states | Cancel buttons (Cancel is not destructive) |
| `border` | All hairlines: dividers, input edges, card edges | Heavy emphasis; that's `ring` |
| `input` | Form field background only | Anywhere outside form fields |
| `ring` | Focus-visible border color, active selection emphasis | Persistent decoration |
| `sidebar` (+ variants) | Secondary panel chrome, including the right sidebar | Main canvas and floating surfaces |
| `editor-surface` | Host styles inside Monaco / markdown panes; it follows the app canvas | App chrome (use `background` directly) |

The standard `sidebar` family expands into `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, and `--sidebar-ring`. The left workspace rail uses `.worktree-sidebar-theme` as the scope for user appearance overrides while consuming this same family; it does not maintain a second token family. `editor-surface` remains a host-integration alias for Monaco and markdown CSS, but it resolves to `background` so tab chrome and content form one canvas. JSX pane roots use `bg-background`; host styles may consume `var(--editor-surface)` where a CSS variable is required.

Ordinary interactive chrome (buttons, list-row hover, nav selection) uses **`accent`**, not sidebar-specific hover tokens. Sidebar tokens paint panel surfaces and borders; they are not a second interaction system.

### Git decoration colors

For diff status, file-tree decorations, and the changes view, use the git decoration tokens (mirroring VS Code's palette so users transferring from VS Code aren't surprised):

| Token | State |
| --- | --- |
| `--git-decoration-added` | Added / new |
| `--git-decoration-modified` | Modified |
| `--git-decoration-deleted` | Deleted |
| `--git-decoration-renamed` | Renamed |
| `--git-decoration-untracked` | Untracked |
| `--git-decoration-copied` | Copied |
| `--git-decoration-ignored` | Ignored by git |

Use these _only_ for git status. Don't reuse them for unrelated state colors — that breaks the convention.

### Editor diff colors

Monaco and Pierre diffs share Cursor's diff palette through the `--editor-diff-*` variables. These are separate from git status decorations because Cursor deliberately uses different colors for resource status, gutters, full changed lines, and changed text within a line.

| Token | Diff role |
| --- | --- |
| `--editor-diff-inserted-line-background` | Full inserted-line fill |
| `--editor-diff-inserted-text-background` | Inserted word/character fill |
| `--editor-diff-removed-line-background` | Full removed-line fill |
| `--editor-diff-removed-text-background` | Removed word/character fill |
| `--editor-diff-added-gutter` | Added gutter indicator |
| `--editor-diff-modified-gutter` | Modified gutter indicator |
| `--editor-diff-deleted-gutter` | Deleted gutter indicator |

Use these only inside editor/diff surfaces. File status labels and trees continue to use `--git-decoration-*`.

### List rows: hover, selected, current

A common point of drift. Use these conventions for any list-style row (worktrees, command palette items, settings nav):

- **Idle:** transparent background.
- **Hover:** `bg-accent` (via the control's primitive, or on the row itself).
- **Keyboard-selected (cmdk highlight):** `data-[selected=true]:bg-accent` plus a `border-border` edge so the active row stays visible while the user types. The `data-selected` attribute is set by `cmdk` automatically.
- **Persistent "current" / "active" row** (e.g. the worktree the user is viewing): also `bg-accent`, _plus_ a `data-current="true"` attribute so CSS or future styling can distinguish it from the cmdk highlight.
- **Don't:** hardcode `bg-[#ededed]` / `bg-[#333333]`, `bg-black/N dark:bg-white/N`, or invent a "selected" color. The accent token already adapts to light/dark and matches the rest of the app.

### Color mixing

When you need a tint (e.g. a 12% primary wash on hover), use `color-mix` against the existing token, not a new hex:

```css
background: color-mix(in srgb, var(--primary) 12%, var(--background));
```

This keeps light/dark parity automatic. Prefer a theme-agnostic mix over a `dark:` twin that recomputes the same role.

## Typography

- **Family:** The platform system UI stack is the default. Consume `var(--font-sans)` or inherit it; don't hardcode a platform font. `Geist` remains bundled for users who explicitly select it.
- **Mono:** `var(--font-mono)` — the platform system monospace stack, used for paths, terminal-adjacent UI, code, and anywhere monospace conveys "this is literal."
- **Rendering:** Body text defaults to 14px with `0.01em` letter-spacing and antialiased macOS font smoothing. Don't override these globally in a component.
- **Code size:** Editors, diffs, and terminals default to 13px. Editor zoom may adjust this at runtime, but source and diff views keep the same baseline.
- **Sizes:** Tailwind's default scale. Common sizes in this repo:
  - 11px (uppercase meta, sidebar headers, captions) — pair with `font-weight: 600` and `text-transform: uppercase` and `letter-spacing: 0.05em` for category labels.
  - 12px (sub-text, paths, secondary content)
  - 13px (sidebar items, dense list rows)
  - 14px (default body, button text in `default` size)

## Radius

Yiru is fully rectilinear: `--radius: 0`, and every rendered element is held to `border-radius: 0`. This global rule intentionally covers legacy `rounded-*` utilities, arbitrary and inline values, pseudo-elements, and third-party components that do not use the token. New code must not introduce corner rounding; do not add `rounded-*` to class strings — they are no-ops under the global reset and signal copy-paste drift.

## Native chat geometry

Native chat borrows Cursor's transcript hierarchy while remaining fully rectilinear:

- Transcript, composer, question, and approval surfaces share one centered 840px maximum-width column.
- Conversation rows use a 12px vertical gap and 14px text at 1.5 line-height.
- Assistant prose stays unboxed. User turns and expanded tool output use `card` plus a hairline `border`.
- The composer overlays the transcript bottom; a measured scroll inset and background fade keep the final turn readable as its editor grows from 36px up to 200px.
- Tool activity starts as compact disclosure lines. Only output, diffs, questions, and approvals become bounded surfaces.
- These surfaces remain square. Do not reintroduce Cursor's pills, squircles, or rounded message cards.

## Elevation & shadows

Yiru does not use decorative shadows or visible CSS outlines. Use `border` with
the `border` token for surface separation and focus state, plus opaque
backgrounds for overlays. Do not add `shadow-*`, `drop-shadow-*`, `box-shadow`,
`text-shadow`, or outline styles that draw a stroke; remove legacy declarations
at their source. A source-local `outline: none` / `outline-none` reset is allowed
only to suppress the browser's native focus ring when the component supplies a
border or background focus state. Never implement either policy as a global
override.

### Floating surfaces

Floating primitives share private recipes in `components/ui/floating-surface-styles.ts`; screens import the rendered wrappers (`Popover`, `DropdownMenu`, …), not that module:

- **Popover, menu, hover card, select:** `bg-popover text-popover-foreground border`.
- **Dialog, command dialog, sheet:** `bg-background text-foreground border` with `bg-black/50` backdrop.

Foreground floating surfaces are always opaque while visible. Their base must not use `/NN` background alpha, translucent `rgba`, `color-mix(..., transparent)`, resting element opacity below 1, or backdrop blur. Enter/exit opacity motion is allowed; transparency also remains valid for modal backdrops, transcript fade masks, drag/selection affordances, and hover-state tints because those intentionally reveal context rather than carry foreground content.

Keep placement and z-index in each headless wrapper. Shared color, elevation, and enter/exit recipes stay in the style module so sibling surfaces cannot drift; a wrapper keeps only motion that is genuinely different (for example, sheet direction).

## Components

Primitives live in `apps/desktop/src/renderer/src/components/ui/`. Full inventory: [`components/ui/README.md`](../apps/desktop/src/renderer/src/components/ui/README.md).

Wrapper conventions:

- Shadcn-style primitive parts carry `data-slot="<name>"` for CSS targeting — do not strip it. Third-party wrappers such as Sonner keep their library-owned data attributes.
- Use `cn()` for class merging. Pass user `className` last so callers can override _layout_, not to invent a parallel visual system.
- Use `class-variance-authority` (CVA) for variants when there are multiple.
- Interactive headless behavior uses Base UI; `command` wraps `cmdk`, `sonner` wraps Sonner. Never reimplement headless behavior; extend the existing wrapper.

### Buttons (`button.tsx`)

Do not use a raw `<button>` for app chrome. Use `Button`.

Variants in priority order:

| Variant | Use case |
| --- | --- |
| `default` | The single affirmative action in a flow. |
| `secondary` | Lower-emphasis sibling next to a `default`. |
| `outline` | Toolbar / standalone actions where a filled button feels heavy. |
| `outline-transparent` | Titlebar controls with vertical separators that must reveal the host material. |
| `ghost` | Icon buttons, list-row triggers, anywhere chrome should disappear. |
| `quiet` | Muted icon/toolbar controls that rest quieter than `ghost` (muted foreground, accent on hover/focus). |
| `status-bar` | Full-height footer actions with a background focus state and no border seam. |
| `status-bar-icon` | Muted full-height footer icons with selected state from `aria-current`. |
| `status-bar-quiet` | Muted full-height footer labels with quiet hover and focus states. |
| `link` | Inline text actions inside paragraphs. |
| `destructive` | Delete, discard, irreversible. Never for Cancel. |

Sizes: `default` (36px), `sm` (32px), `xs` (24px), `lg` (40px), content-driven `list-row`, full-height `status-bar`, plus `icon`, `icon-xs`, `icon-status-bar`, `icon-status-bar-wide`, `icon-sm`, `icon-lg`, `icon-titlebar`, `icon-titlebar-compact`, `icon-titlebar-wide`, and `icon-titlebar-extra-wide`. The status-bar sizes fill their footer row while preserving compact content widths; `icon-status-bar-wide` provides a 24px target for grouped footer navigation, while titlebar sizes fill their row at 28px, 24px, 32px, and 36px widths. Match the size to the surrounding row height — don't drop a `default` button into a 28px toolbar. Use `status-bar` / `icon-status-bar` for footer actions, `list-row` for multi-line list actions, and prefer `xs` / `icon-xs` for dense chrome instead of overriding height in `className`.

### Forms

Use `Input`, `Textarea`, `Label`, `Checkbox`, `Switch`, `Select`, `Slider` — not raw `<input>` / `<textarea>` / `<select>` — unless a host editor or IME contract cannot be preserved (document that why in a short comment).

The pattern in `apps/desktop/src/renderer/src/components/settings/settings-form-controls.tsx` is the house style for any label + control + helper text:

- **Outer stack:** `space-y-3` for full-section forms; `space-y-2` for compact single-control fields.
- **Label group:** `space-y-1` containing `<Label>` and a description in `text-xs text-muted-foreground`.
- **Control:** the shadcn primitive. Errors surface via `aria-invalid`; the renderer maps that to a destructive focus border — don't paint your own.
- **Trailing metadata:** `text-[11px] text-muted-foreground` below the control, not next to the label.

Immediate on/off settings use `Switch`, not `Button role="switch"`. Independent booleans use `Checkbox`.

### Badges

Use `Badge` for compact persistent metadata. Prefer `size="xs"` for dense chips and status tones (`success`, `warning`) instead of hand-rolled pill class strings.

### Picking the right primitive

| You want… | Reach for | Don't use |
| --- | --- | --- |
| App action / toolbar control | `Button` | Native `<button>` with copied classes |
| Hover-only label on an icon-only button | `Tooltip` | `HoverCard` (too heavy), title attr |
| Hover preview of richer content (avatar + summary) | `HoverCard` | `Tooltip` (no rich content) |
| Click-revealed menu with actions | `DropdownMenu` | `Popover` with hand-rolled list |
| Right-click contextual actions | `ContextMenu` | Hand-rolled `role="menu"` portal |
| Click-revealed surface with arbitrary content (form, picker) | `Popover` | `Dialog` (it traps focus and dims) |
| Modal that demands a decision before you continue | `Dialog` | `Popover`, inline overlay |
| Drawer / panel sliding in from an edge | `Sheet` | `Dialog` centered |
| Peer views in one region | `Tabs` | Custom tablist + panels |
| Single choice from a known list | `Select` | Native `<select>` / custom listbox |
| Single choice with search / fuzzy filtering | `Command` inside `Popover` | `Select` (no search) |
| Multi-select with search | Compose `Command` inside `Popover`; follow the nearest domain combobox | Put domain data in `components/ui/` |
| Transient confirmation ("Saved", "Copied") | `sonner` toast | `Dialog`, inline banner |
| Persistent inline status ("3 errors") | inline text + `Badge` | toast (toasts disappear) |

If you find yourself styling around a primitive (`<Popover>` to act like a `<Dialog>`, or vice versa), stop and reconsider — the focus-management semantics differ and a future contributor will be misled by the mismatch.

### Tooltips

Tooltips exist to _name_ a control whose meaning isn't obvious from its appearance. They are not the place to teach, persuade, or warn — anything users need to read while acting belongs in the visible UI.

- **Use a tooltip when:** an icon-only button or compact chip needs a label. Toolbar icons, badges with abbreviations, truncated paths.
- **Don't use a tooltip when:** the control already has a visible label, the content is interactive (links, buttons), or the message is critical (errors, blocking warnings — those go inline).
- **Mounting:** the global `<TooltipProvider delay={400}>` lives at the App root. Don't nest a second `TooltipProvider` unless you need a different delay for a tightly-scoped surface.
- **Trigger pattern:** pass the trigger element through `<TooltipTrigger render={...} />` so Base UI merges the tooltip's accessibility props onto the button (not a wrapper span). This is required for keyboard focus to surface the tooltip.
- **Placement:** default `side="top" sideOffset={4}` — match the toolbar pattern in `sidebar/sidebar-toolbar.tsx`. Pick a different side only when the default would clip against the viewport.
- **Shortcut chips inside tooltips:** if the action has a keyboard shortcut, append `<ShortcutKeyCombo />` rather than baking the keys into the label string. The chips render correctly per platform; baked-in strings drift.

```tsx
<Tooltip>
  <TooltipTrigger
    render={
      <Button variant="ghost" size="icon-sm" onClick={openSettings}>
        <Settings />
      </Button>
    }
  />
  <TooltipContent side="top" sideOffset={4}>
    Settings
  </TooltipContent>
</Tooltip>
```

### Icons

Icons come from **`@phosphor-icons/react`**. Don't import a second icon library.

- **Default size:** `size-4` (16px). `Button` auto-applies this to any `<svg>` it contains via `[&_svg:not([class*='size-'])]:size-4`, so most call sites don't need to set a size on the icon.
- **`size-3` / `size-3.5`:** for metadata, captions, and dense list rows where 16px is too loud.
- **`size-7`+:** for featured/empty-state hero icons only.
- **Weight:** the renderer-wide `IconContext.Provider` defaults Phosphor icons to `duotone`. Every Phosphor icon whose exported name contains `Arrow` or `Caret` uses `regular`, including aliased imports such as `ChevronDown`, `ExternalLink`, `RefreshCw`, and `Workflow`. Standalone `X` glyphs and close-action glyphs use `regular` as well. The explicitly quieter compact chrome also uses `regular`: the new-workspace, new-tab, and tab-strip More glyphs, terminal-tab chrome, and project headers. Scope multi-icon composites with the existing provider; outside these rules, inherit the default instead of adding one-off overrides or wrappers.
- **Color:** inherit from surrounding text — `text-muted-foreground` for secondary, `text-destructive` for destructive, etc. Don't apply a token to the SVG directly when the parent already carries the right color.
- **Loader:** the canonical loading icon is `<LoadingIndicator className="size-4" />` from `components/loading-indicator.tsx`. It follows the user's Appearance setting and always uses `foreground` (black in light mode, white in dark mode), so call sites set only size/layout and never a state color. Don't import a one-off generic spinner. For 3s+ multi-step work, prefer a label that names the stage ("Cloning…" → "Installing…") over an unlabeled loader. See _UX rule 1_.

### Keyboard shortcut chips

Use **`<ShortcutKeyCombo />`** from `apps/desktop/src/renderer/src/components/shortcut-key-combo.tsx`. It renders a consistent key-cap style and inserts a `+` separator on Windows/Linux (Mac shows adjacent glyphs, no separator). It does **not** transform key strings — the _caller_ picks the platform-appropriate labels and passes them in:

```tsx
const isMac = navigator.userAgent.includes('Mac')
const mod = isMac ? '⌘' : 'Ctrl'
const shift = isMac ? '⇧' : 'Shift'
<ShortcutKeyCombo keys={[mod, shift, 'N']} />
```

See `apps/desktop/src/renderer/src/components/landing-page.tsx` for the canonical pattern. Don't roll a one-off `<kbd>` — kbd chips drift in shape and color across the app fast if everyone styles their own.

**Where shortcuts surface in the UI:**

- **Tooltips on icon buttons** — append the chip after the label, trailing.
- **Dropdown / context-menu items** — use `<DropdownMenuShortcut>` (or its context-menu equivalent) for the right-aligned chip; don't position one yourself.
- **Never on Cancel, Dismiss, or `link`-variant inline actions** — see _UX rule 3_.

**The label MUST match the actual binding for the platform.** If the keyboard handler reads `metaKey` on Mac and `ctrlKey` elsewhere, the chip must show `⌘` on Mac and `Ctrl` elsewhere. Mismatched chips are worse than no chip.

### Scrollbars

Four scrollbar classes are defined globally in `main.css`:

- **`.scrollbar-sleek`** — the default thin, neutral scrollbar for sidebars, lists, popovers. Pair with `.scrollbar-sleek-parent` on a hover-target ancestor if you want the thumb to fade in only on parent hover.
- **`.scrollbar-sleek-lg`** — a larger grab target for dense tables; use only together with `.scrollbar-sleek`.
- **`.scrollbar-editor`** — slightly heavier, used inside Monaco-adjacent surfaces.
- **`.worktree-sidebar-scrollbar`** — no reserved gutter: paired with `overflow-y-auto`, the scrollbar (and its width) exists only while content actually overflows, so a short list stays flush with the fixed header controls and classic-scrollbar Windows shows no arrow buttons on empty lists. The thumb stays invisible until the parent (`.scrollbar-sleek-parent`) is hovered. Used only in the worktree sidebar.

Apply one of these to overflow containers; don't write a fourth style.

## UX rules

These are the rules a contributor will most often get wrong if they're working in isolation. They apply to every UI change.

**UI copy must not overclaim.** Never imply the app has taken an action, made a decision, or observed a fact unless the code has real state or result data to support it. Use neutral process language while work is pending, and reserve result verbs like "skipped", "protected", "found", "verified", or "deleted" for actual results.

### Screen UX review rubric

Use this rubric when reviewing any Yiru IDE screen, screenshot, or prototype. A good review should name the highest-impact friction first, then give concrete changes the implementer can make.

#### Review output format

1. **Top fixes:** the 3 changes that would most improve the screen.
2. **Friction notes:** specific clutter, alignment, copy, focus, or flow issues, with the affected UI element named.
3. **Suggested changes:** exact changes to layout, hierarchy, controls, copy, empty/error states, and disclosure.
4. **Keyboard and speed check:** whether the primary workflow can be completed in 1-2 actions where appropriate, with good default focus and Enter/Esc behavior.
5. **Follow-up links or states:** missing external links, acquisition actions, or persistent errors the user needs to recover.

#### What to judge

- **Progressive disclosure:** keep high-frequency actions visible and prominent. Move low-frequency actions out of the common pointer path into menus, overflow controls, detail drawers, or advanced sections. Do not make menus so long that the user has to scan unrelated actions; group or split them when they grow.
- **Action hierarchy:** the primary action must be obvious through placement, size, and `default` button styling. Put high-frequency actions at the top of menus and in the most reachable toolbar positions. Secondary and rare actions should not compete with the primary action.
- **Click count:** remove unnecessary intermediate steps. Common workflows should complete in 1-2 actions when the app already has enough information to proceed.
- **Default focus:** dialogs, popovers, and command surfaces should focus the field or primary action the user is most likely to use. If Enter submits, focus must land where Enter triggers the intended primary action. Esc should back out without adding visual noise to Cancel/Dismiss.
- **Keyboard navigation:** prefer searchable command surfaces for long option lists. Add search fields when users need to find repositories, branches, worktrees, agents, commands, settings, files, or providers from a list.
- **Shortcut labels:** show shortcut chips only for shortcuts that are actually implemented and useful at that location. Labels must match the platform binding. If a shortcut strategy is undecided, do not expose a placeholder label in product UI.
- **Alignment:** rows and columns must line up to a visible grid. Left-align text and labels for scanability; right-align numbers, counts, shortcuts, and trailing metadata when comparison matters; center-align only compact icon controls, empty states, and table cells where symmetry is the clearest read.
- **Copy quality:** displayed text must be typo-free, concise, and specific. Prefer direct verbs and concrete nouns. Remove filler like "please", "simply", "just", "you can", and generic success language that is not backed by state.
- **Dialogs and overlays:** choose a dialog size that matches the amount of input. Short confirmations stay compact; forms with multi-line text, path pickers, provider setup, or review content need a larger dialog or sheet. Floating surfaces must use the documented elevation and background treatment so they read as above the page.
- **Empty and error states:** when data is missing, show a direct action to acquire or configure that data. Use toasts for transient failures or confirmations; persist errors inline when the user needs to read, retry, copy, or act on the message.
- **External links:** add direct links when the user may need provider docs, token settings, billing/setup pages, Git provider resources, or troubleshooting context. Put links near the relevant empty state, error, helper text, or setup step instead of burying them in a generic menu.
- **Affordance:** users should be able to discover available features without intrusive education. Use familiar Phosphor icons, visible hover/focus states, clear labels where needed, and tooltips for icon-only controls. Prefer the simple icon already used by a sibling surface over an obscure alternative.
- **Layout density:** avoid jamming controls together. Preserve breathing room around the primary workflow, reduce competing buttons, and keep toolbar groups visually distinct. Dense screens are acceptable only when grouping, alignment, and hierarchy make scanning faster.
- **Cards and containers:** cards must be visually distinct from their parent surface through the existing `card`/`border` treatment. Avoid nesting cards inside cards. If a section is not a repeated item, modal, or framed tool, consider an unframed layout or full-width band instead.
- **Side-by-side layouts:** default to row-by-row layouts for complex workflows because they are easier to align and scan. Use side-by-side layouts only when space is constrained or comparison is the point, then polish column widths, baselines, and wrapping states carefully.
- **Animation:** use subtle animation to soften expanding/collapsing content and prevent jumpy layout changes. Animation should clarify continuity, not decorate. Respect reduced-motion settings.
- **SSH and latency:** assume actions may run remotely. Disable submit controls immediately, delay visible loading feedback when appropriate, and keep focus stable while remote data arrives.

### 1. Match in-flight feedback to perceived duration

The right question isn't _"should this control change while it's working?"_ — it's _"how long does the action take, and what does the user need to know during that time?"_

| Duration | Feedback |
| --- | --- |
| 0–100 ms | None. Anything visible reads as a glitch. |
| 100 ms–1 s | Disabled state only. |
| 1 s–3 s | Disabled + spinner or label swap. |
| 3 s+ or multi-step | Stage labels, progress, optional reassurance. |

Two corollaries:

- **Pre-reserve any space you'll later occupy.** If a control may swap to a longer label or grow an icon, fix its footprint up front (use `width`, not `min-width`). A control that resizes mid-action looks broken even when the action succeeded.
- **Don't pick worst-case feedback for everyone.** If the action is fast locally and slow remotely (SSH), defer the visible loading state by ~200ms. Local users see nothing; remote users get appropriate feedback. Bind the _disabled_ state immediately (so double-clicks don't double-submit) and the _visible_ state on a timer.

### 2. Look for sibling components before designing in isolation

If your component has a sibling — same domain, overlapping behavior, often visible at adjacent moments in the same flow — the two should read as one design. Same icons, same shortcut conventions, same submit semantics. A user moving between them shouldn't perceive a seam.

This is _not_ "match every existing pattern." Some repo patterns are debt and copying them spreads the debt. The narrower claim is about _adjacent_ components. Diverging from a sibling needs a reason: either the sibling is wrong (fix both) or the new component has a real difference in role (commit to it).

When there's no sibling, match the surrounding chrome — button sizes, icon weights, copy tone — and don't manufacture a sibling from a screen the user will never correlate with this one.

### 3. Don't overload the back-out path

`destructive` is for actions that lose data or can't be undone. **Cancel, Dismiss, Close, and Discard are not destructive** — they back the user out of an in-progress action and should stay quiet (default ghost button, no color, no keyboard chip, no animated affordance). Save the visual weight for the affirmative action so the two don't compete. Keyboard handlers can still honor Esc; the visible decoration is what stays minimal.

## Cross-platform

Yiru runs on macOS, Linux, and Windows. Every UI change must hold up on all three, in both light and dark mode.

- **Modifier keys:** Never hardcode `e.metaKey`. Use `navigator.userAgent.includes('Mac')` to choose `metaKey` on Mac and `ctrlKey` on Linux/Windows. Electron menu accelerators should use `CmdOrCtrl`.
- **Shortcut labels:** Display `⌘` / `⇧` on Mac; display `Ctrl+` / `Shift+` on other platforms. The label must reflect the actual binding for that platform.
- **Window chrome:** macOS shows traffic lights; the titlebar reserves a 92px gutter (`titlebar-traffic-light-pad`) so its outer spacing stays symmetric and content cannot overlap it. Don't put hit targets in that band on Mac.
- **SSH:** Many users run Yiru on a remote machine. Loading states, focus management, and animations must hold up under 50–200 ms of extra latency. Test under simulated latency (or actual SSH) — local-only verification isn't enough. See _UX rules → 1_.

## When this guide is silent

If you have a UI question this doc doesn't answer:

1. Check [`components/ui/README.md`](../apps/desktop/src/renderer/src/components/ui/README.md) for a primitive that already encodes the pattern.
2. Look at adjacent code in `apps/desktop/src/renderer/src/components/` for the closest sibling, and follow its lead — as long as that sibling already uses primitives correctly.
3. If it's a token question, stay inside the default shadcn roles or Tailwind palette; check `main.css` only for an existing product-domain exception.
4. If none of those resolve it, ask before adding a token, inventing a visual rule, or shipping a new native control.
