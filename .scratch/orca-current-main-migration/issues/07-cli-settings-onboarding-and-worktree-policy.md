# Complete input persistence and branch-prefix policy

Type: task
Status: done
Blocked by:

## Question

How should IME composition and branch-prefix policy preserve user input while rejecting invalid Git
refs consistently across local, WSL, SSH, runtime, and Settings callers?

## Scope

- `a90ec540f`: persist the final IME syllable when a settings field blurs/unmounts mid-composition.
- `d1ccfcff4`: normalize and validate branch prefixes in Settings and every local/SSH/runtime consumer.

## Ownership boundary

Centralize branch validation outside renderer components, then expose actionable Settings feedback.
Keep IME draft ownership inside the existing controlled-input contract and flush only the visible
composition once.

## Acceptance

- IME composition commits exactly once on blur/unmount.
- Invalid branch prefixes cannot reach Git; normalized valid prefixes behave consistently on local,
  WSL, SSH, and runtime hosts with provider-neutral naming.
- Focused tests cover IME state and shared branch-prefix validation at local/SSH/runtime boundaries.

## Commit boundary

One input/branch-policy commit.
