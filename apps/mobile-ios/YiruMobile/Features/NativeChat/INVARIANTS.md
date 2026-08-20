# Native Chat invariants

## Entries

- A terminal session can open the Native Chat transcript for its agent/session scope. The route
  exposes live transcript updates, older-history loading, the composer, attachments, Ask-user
  prompts, tool details, and links back to files or terminal panes.
- Agent, session ID, transcript path, host ID, worktree ID, and tab ID form the observation scope;
  a scope change starts a fresh transcript and cannot leak pending sends from the prior session.

## State and transport

- `NativeChatModel` owns transcript pages, folded tool messages, the byte cursor, live stream phase,
  draft, send confirmation, and retryable errors. `NativeChatRepository` is the only transport
  boundary for chat frames, history, files, and image upload.
- Live frames are deduplicated by turn/message identity and capped to a bounded retained window.
  Older runtimes that ignore cursors use a growing-tail replacement rather than duplicating rows.
- User sends are tracked as pending until the server transcript confirms the expected occurrence;
  a timed unconfirmed send preserves the draft and reports the failure without fabricating a
  completed turn. View cancellation stops observation without closing the shared host connection.
- Drafts persist per host/worktree/tab key. Attachment and Ask-user flows are explicit state
  machines and cannot send while the terminal/session scope is unavailable.

## Visual and accessibility contract

- Transcript content uses the old Mobile message hierarchy and neutral text colors. Tool details,
  prompt cards, attachment controls, and composer actions use semantic Hugeicons IDs and shared
  button contexts rather than ad-hoc symbols.
- The composer respects the Settings-selected loader style, keeps the 44-point input/action hit
  targets, and remains usable with the keyboard, VoiceOver, Dynamic Type, and iPhone/iPad width
  changes. No blue tint or gradient background is introduced by the chat feature.
