# Shrink YiruRuntimeService to composition

Type: task
Status: open
Blocked by: 02

## Question

After Terminal authority extraction, which remaining mutable state clusters can be moved into already-real command/state-owner modules so `YiruRuntimeService` becomes a composition and coordination module rather than a universal interface? Implement the safe clusters exposed by the extraction and remove pass-through methods where callers can use the deeper module directly.

## Comments


