# Localization Audit

This is the pre-work artifact for migrating Yiru to a localized UI. The goal is
to make coverage repeatable: every detected user-facing string is either moved
behind the localization layer or explicitly excluded with a reason.

## Coverage Contract

Coverage means all strings matching the audit scope below are accounted for:

- JSX text rendered in the renderer.
- Accessibility and form attributes such as `aria-label`, `ariaLabel`, `alt`,
  `placeholder`, `title`, `label`, `description`, `subtitle`, and `tooltip`.
- User-facing object metadata such as Settings search `title`, `description`,
  `keywords`, labels, badges, helper text, and tooltips.
- User-facing calls such as `toast.success(...)`, `toast.error(...)`, browser
  `alert(...)`, `confirm(...)`, and `prompt(...)`.

The audit intentionally does not treat these as localization misses unless they
are surfaced directly as UI copy:

- Terminal output, agent output, git output, provider API errors, and shell
  commands.
- File paths, URLs, environment variables, telemetry event names, IDs, and
  protocol names.
- Developer logs, internal diagnostics, test fixtures, and snapshots.
- Brand, provider, model, command, and product names that should remain exact.

## Review Workflow

The repository does not ship a custom localization scanner or catalog synchronizer. Review
renderer copy directly against the coverage contract above, update locale catalogs by hand, and
use normal lint and typechecking for validation.

## Migration States

Each candidate should end in one of these states:

- `localized`: the component reads the string from the locale catalog.
- `excluded`: the string is intentionally not localized, with a reason from the
  coverage contract.
- `deferred`: the string is user-facing but belongs to a later PR wave.

`deferred` is acceptable for planning, but not for the localization coverage
gate.

## PR Waves

Recommended migration order:

1. Infrastructure, English catalog, language setting, and language selector.
2. Settings shell, Settings search metadata, and Appearance.
3. App shell, sidebars, titlebar, status bar, command surfaces, and global
   dialogs/toasts.
4. Source control, hosted review, and provider-specific UI.
5. Terminal chrome, onboarding, feature tips, mobile, browser, and remaining
   secondary surfaces.

## Proof Strategy

Final review should combine three checks:

1. Source review: no unclassified localizable candidates remain.
2. Catalog coverage: every supported locale has the same keys as English, with
   matching interpolation variables.
3. Runtime coverage: English and Simplified Chinese smoke tests show no obvious
   untranslated copy or layout clipping in core screens.

Human review should verify ambiguous exclusions.
