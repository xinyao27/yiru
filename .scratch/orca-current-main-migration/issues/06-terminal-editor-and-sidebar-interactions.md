# Complete terminal/Web input and owner-correct file reveal

Type: task
Status: done
Blocked by:

## Question

How should native/Web terminal input and file-line routing behave so input is delivered once and a
terminal link always reveals the correct owner-qualified editor tab?

## Scope

- `eefded2a0`: prevent Linux native middle-click primary-selection paste from firing twice.
- `a4f42ad42`: support Ctrl/Cmd+V through clipboard events in the HTTP Web client.
- `d50ea090c` (partial): open Markdown file links at the target line with owner-qualified file ids.

## Ownership boundary

Keep input event ownership singular, use platform-aware shortcut checks, and carry execution-host/
file-owner identity through file-open routing. Markdown line reveals must switch to a line-capable
source view before scheduling Monaco reveal.

## Acceptance

- Middle-click and clipboard paste work on Linux and HTTP Web without duplicate delivery or silent
  failure.
- Markdown targets open at the requested line on the owning local/WSL/SSH host.
- Targeted tests cover event ownership, insecure-context clipboard fallback, Markdown source mode,
  stale async reveals, and owner-qualified file-line routing.

## Commit boundary

One terminal input/file-reveal commit. Do not mix in the UX polish from ticket 09.
