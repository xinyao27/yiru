# Complete Mobile and Web runtime behavior

Type: task
Status: done
Blocked by:

## Question

How should Mobile and Web preserve agent launch policy, usage loading, and image input recovery
across reconnects and version-skewed paired hosts?

## Scope

- `6997bc40a`: treat undefined provider usage-scan state as loading/unavailable, not a crash.
- `69d05b6e2` (partial): send `startupAgent` for new Mobile sessions so the host resolves default and
  permission arguments through the same policy as desktop.
- `e651fe91c`: heal terminal input after an image send has ambiguous delivery.

## Ownership boundary

Keep permission/default argument resolution on the execution host. Mobile sends intent and uses
versioned capability gates; Web renders absent state defensively. Preserve mixed-version protocol
fallbacks rather than assuming desktop and Mobile update together.

## Acceptance

- Undefined Claude/Codex/OpenCode usage state renders a stable loading/unavailable view.
- Blank and source-workspace Mobile launches carry agent intent; the host applies the correct
  provider permission/default arguments exactly once.
- Ambiguous image-send outcomes cannot leave terminal input permanently disabled or duplicate a
  confirmed send.
- Focused tests cover protocol skew, launch intent resolution, undefined state, and ambiguous-send
  state transitions.

## Commit boundary

One Mobile/Web runtime-behavior commit. Keep desktop terminal event fixes in ticket 06.
