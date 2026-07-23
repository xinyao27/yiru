# Promote cross-app domain and protocol modules

Type: task
Status: open
Blocked by: 04

## Question

Move the mobile-consumed runtime protocol and domain model out of desktop-owned source into concrete workspace packages, split the `shared/types.ts` umbrella by domain, migrate desktop/mobile/relay/web imports, and eliminate deep cross-app relative imports without creating a new generic dumping ground.

## Comments


