# Polish agent retention and Claude usage freshness

Type: task
Status: deferred
Blocked by: 01

## Question

How can Claude usage refresh and retained-agent projection close their narrow lifecycle races without
changing the main session authority established by ticket 01?

## Scope

- `dd642cb3e`: refetch Claude usage after the final live Claude PTY exits.
- `eea1577dd`: prevent an explicit close racing with PTY exit from recreating a retained agent row.

## Acceptance

- The last-Claude-PTY transition clears the relevant backoff and schedules one refresh.
- A deliberately closed agent row does not return through the retention projection.
- Underlying sessions/processes are untouched; focused tests cover only the two concurrency edges.

## Commit boundary

One optional agent/status lifecycle commit.
