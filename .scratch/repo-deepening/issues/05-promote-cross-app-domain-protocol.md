# Promote cross-app domain and protocol modules

Type: task
Status: resolved
Blocked by: 04

## Question

Move the mobile-consumed runtime protocol and domain model out of desktop-owned source into concrete workspace packages, split the `shared/types.ts` umbrella by domain, migrate desktop/mobile/relay/web imports, and eliminate deep cross-app relative imports without creating a new generic dumping ground.

## Comments

### Ownership decision

The first cross-client cohort is split by interface rather than by its former directory:

- `@yiru/runtime-protocol` owns versioned runtime envelopes, capabilities, event messages, and the
  mobile-consumed runtime DTO slices.
- `@yiru/mobile-relay-protocol` owns pairing, credential, phone, E2EE, framing, and outbound-flow
  contracts; it has no dependency on either app.
- `@yiru/workbench-model` owns cross-client agent, review, workspace, and platform-neutral product
  models and pure policies. Its manifest exposes six stable domain entries (`agent`, `review`,
  `workspace`, `platform`, `ui`, and `product`) instead of mirroring every source file.

Desktop-only portions of the 3,000-line `shared/types.ts` and 1,000-line `runtime-types.ts` remain
desktop-owned. Mobile-consumed declarations are extracted and re-exported from those legacy
aggregates for compatibility while all direct mobile, desktop, relay, and web consumers migrate to
the package owners. This prevents a mechanical move from turning either package into a second
`shared` dumping ground.

### Resolution

- Replaced 219 mobile-to-desktop imports across 154 files with package-owned contracts and reduced
  the remaining raw `desktop/src` reference count in mobile to zero.
- Moved runtime compatibility/RPC/SSH/terminal DTOs to `@yiru/runtime-protocol`; moved pairing,
  credential, E2EE, framing, phone, and backpressure contracts to `@yiru/mobile-relay-protocol`.
- Moved the mobile-consumed agent, native-chat, review, workspace, path, and product policies to
  `@yiru/workbench-model`; split the oversized review declaration cohort into PR, review-detail,
  and branch-compare modules.
- Kept the workbench manifest at six domain exports and removed duplicate terminal-title policy
  implementations by making the title resolver consume the canonical title core.
- Removed the mobile compatibility-version/evaluator and OSC-validator mirrors; desktop, CLI, and
  mobile now consume the same runtime-protocol implementations.
- Gave standard ESM and CommonJS consumers real built JavaScript entry points while Metro, browser
  development builds, and TypeScript consume source contracts; package barrels are marked
  side-effect-free and compatibility shims retain their former narrow export surfaces.
- Made mobile own its bundled agent icons and removed Metro's desktop-source watch folder.

### Verification

- `pnpm typecheck`
- `pnpm test` — 13 files, 30 behavioral tests passed; no new tests were added
- `pnpm exec vp lint apps packages` — no errors (one pre-existing exhaustive-deps warning)
- `pnpm --filter yiru build:relay`, `build:cli`, `build:electron-vite`, and `build:web`
- Node ESM `import()` and CommonJS `require()` smoke checks across all six workbench domains and
  representative runtime/relay entries, with matching export counts
- Actual `node apps/desktop/out/cli/index.js --help` startup
- Expo iOS export through Metro, including all 28 mobile-owned agent icons
- 135-case pre/post extraction parity matrix for resumable-agent startup across agents and shells
- max-lines ratchet and localization catalog/coverage checks
- Repository contracts pass through bundled-skill guide verification; skill manifest generation is
  environmentally blocked because the worktree lacks complete released tag history.
