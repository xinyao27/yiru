import type { RateLimitResumeService } from '~main/rate-limit-resume/service'
import { ClaudeAgentTeamsService } from '~main/runtime/claude-agent-teams-service'
import type { StatsCollector } from '~main/stats/collector'
import type { CommitMessageAgentEnvironmentResolvers } from '~main/text-generation/commit-message-agent-environment'
import type { TerminalSideEffectBatch } from '~shared/terminal/side-effect-facts'

import type { RemoteFetchResult } from '../model/runtime-store'
import type {
  RuntimeAgentRowSnapshot,
  RuntimePtyTitleTrackerEntry
} from '../model/terminal-observation'
import type {
  PreservedBranchCleanupTarget,
  RuntimeWorktreeRemovalInFlight
} from '../model/worktree-storage'
import { RuntimeStateRuntimeId } from './runtime-state-runtime-id'

export abstract class RuntimeStatePtyTitleTrackersByPtyId extends RuntimeStateRuntimeId {
  protected ptyTitleTrackersByPtyId = new Map<string, RuntimePtyTitleTrackerEntry>()
  // Why: the Command Code output detector arms early from the launch command
  // when known (banner detection covers user-typed launches), mirroring the
  // renderer detector's startupCommand seed.

  protected terminalSpawnCommandsByPtyId = new Map<string, string>()
  // Why: ordinary OSC 0/1/2 titles can split across PTY chunks, especially over
  // SSH/relay buffering. Keep a small raw scan tail and feed reconstructed
  // chunks into the title tracker instead of falling back to last-title scans.

  protected oscTitleScanTailByPtyId = new Map<string, string>()
  // Why: mobile file taps resolve relative paths on the host. OSC 7 is the
  // terminal-owned cwd signal, and it can arrive in live output between snapshots.

  protected osc7ScanTailByPtyId = new Map<string, string>()

  protected terminalCwdByPtyId = new Map<string, string>()

  protected terminalFileUriHostnameByPtyId = new Map<string, string>()
  // Why: latest agent-status payload per pane, retained so worktree.ps can serve
  // mobile the same inline agent rows the desktop sidebar renders. Cleared on pty
  // teardown so dead agents don't linger. See RuntimeAgentRowSnapshot.

  protected latestAgentStatusByPaneKey = new Map<string, RuntimeAgentRowSnapshot>()

  protected stats: StatsCollector | null = null
  // Why (§3.3 + §7.1): the renderer-create path and coordinator
  // `probeWorktreeDrift` share this cache so a create that already fetched
  // `origin` within the last 30s does not re-fetch during dispatch, and
  // vice-versa. Keyed by `<repoPath>::<remote>` so multi-remote repos (even
  // though v1 only uses `origin`) don't cross-contaminate. The in-flight Map
  // also provides serialization — two concurrent callers share a single
  // underlying `git fetch`. Full-remote fetch lifecycle rules:
  //   - entry inserted BEFORE await,
  //   - `.finally()` removes the entry on BOTH success and rejection,
  //   - timestamp written ONLY on success (rejection must not make the
  //     30s freshness cache lie).
  // A literal "insert before await / read-back after await" without these
  // three rules wedges future fetches on the same repo after a single
  // DNS hiccup until process restart (see §3.3 Lifecycle). Exact base-ref
  // refreshes share the in-flight rule and maintain their own exact-base
  // freshness entries; a full-remote fetch may be narrowed by repo refspecs,
  // so it must not prove a specific branch for create.

  protected fetchInflight = new Map<string, Promise<RemoteFetchResult>>()
  // Why: `git fetch origin` and `git fetch origin <refspec>` contend for the
  // same repo remote/ref locks. This queue serializes all fetch shapes for one
  // canonical repo+remote while still letting same-shape callers share promises.

  protected remoteFetchQueueTail = new Map<string, Promise<RemoteFetchResult>>()

  protected fetchLastCompletedAt = new Map<string, number>()
  // Why: `getCanonicalFetchKey` is awaited from every freshness probe and
  // every getOrStartRemoteFetch call. Without memoization the warm-cache hot
  // path spawns a `git rev-parse --git-common-dir` subprocess per touch
  // (twice in createLocalWorktree). Cache by `<repoPath>::<remote>` so the
  // canonical key is resolved at most once per repo+remote in the process.

  protected canonicalFetchKeyCache = new Map<string, string>()

  protected optimisticReconcileTokens = new Map<string, string>()

  protected removeManagedWorktreeInFlight = new Map<string, RuntimeWorktreeRemovalInFlight>()

  protected preservedBranchCleanupByWorktreeId = new Map<string, PreservedBranchCleanupTarget>()

  protected readonly terminalMultiplexSideEffectListeners = new Map<
    string,
    Set<(batch: TerminalSideEffectBatch, wireByteSeq: bigint) => void>
  >()

  protected readonly terminalMultiplexDeliveryHubs = new Map<
    string,
    {
      transportGeneration: string
      listeners: Set<
        (
          data: string,
          meta?: {
            seq?: number
            rawLength?: number
            wireByteSeq?: bigint
            wireByteLength?: number
            cwd?: string
          }
        ) => void
      >
      unsubscribe: () => void
    }
  >()

  protected readonly terminalMultiplexPressureByPty = new Map<
    string,
    Map<string, { participates: boolean; blocked: boolean; pendingRatio: number }>
  >()

  protected readonly terminalMultiplexPausedProducers = new Set<string>()

  protected readonly terminalMultiplexClearListeners = new Map<
    string,
    Set<(seq: bigint, correlationId: number, initiatorClientId: string) => void>
  >()

  protected readonly terminalMultiplexRestoreListeners = new Map<
    string,
    Set<(seq: bigint, reason: 'provider-gap') => void>
  >()

  protected desktopTerminalSideEffectConsumerAvailable = false

  protected terminalSideEffectConsumerAvailable = false

  protected rateLimitResumeService: RateLimitResumeService | null = null

  protected commitMessageAgentEnv: CommitMessageAgentEnvironmentResolvers | null = null

  protected readonly claudeAgentTeams = new ClaudeAgentTeamsService()
}
