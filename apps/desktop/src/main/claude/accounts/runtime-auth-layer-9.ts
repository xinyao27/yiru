import { existsSync, readFileSync } from 'node:fs'

import { writeActiveClaudeKeychainCredentialsForRuntime } from './keychain'
import type {
  ClaudeReadBackResult,
  ClaudeReadBackMatch,
  ClaudeRuntimeCredentialCandidate
} from './runtime-auth-foundation'
import { ClaudeRuntimeAuthLayer8 } from './runtime-auth-layer-8'

export abstract class ClaudeRuntimeAuthLayer9 extends ClaudeRuntimeAuthLayer8 {
  clearLastWrittenCredentialsJson(
    accountId = this.store.getSettings().activeClaudeManagedAccountId
  ): void {
    if (accountId === this.store.getSettings().activeClaudeManagedAccountId) {
      this.lastWrittenCredentialsJson = null
    }
    this.skipNextReadBackForAccountId = accountId
  }

  protected async readBackRefreshedTokens(
    baselineCredentialsJson: string,
    options: { updateLastWrittenCredentialsJson: boolean }
  ): Promise<ClaudeReadBackResult> {
    try {
      const candidates =
        await this.readRuntimeCredentialCandidatesForReadBack(baselineCredentialsJson)
      if (candidates.length === 0) {
        return { status: 'unchanged' }
      }
      const changedCandidates =
        this.lastWrittenCredentialsJson === null
          ? candidates
          : candidates.filter(
              (candidate) => candidate.credentialsJson !== this.lastWrittenCredentialsJson
            )
      if (changedCandidates.length === 0) {
        return { status: 'unchanged' }
      }

      const acceptedCandidates: {
        credentialsJson: string
        match: Extract<ClaudeReadBackMatch, { kind: 'matched' }>
      }[] = []
      const ambiguousCandidates: string[] = []
      let sawAmbiguousCandidate = false
      let sawValidChangedCandidate = false
      for (const runtimeContents of changedCandidates) {
        if (!this.isValidCredentialsJsonObject(runtimeContents.credentialsJson)) {
          continue
        }
        sawValidChangedCandidate = true
        const match = await this.findManagedAccountForRuntimeCredentials(
          runtimeContents.credentialsJson,
          runtimeContents.runtimeOauthAccount
        )
        if (match.kind === 'ambiguous') {
          sawAmbiguousCandidate = true
          ambiguousCandidates.push(runtimeContents.credentialsJson)
          continue
        }
        if (match.kind !== 'matched') {
          continue
        }
        // Why: on cold app start we cannot tell whether matching runtime
        // credentials are a fresh CLI refresh or stale state. Adopt when the
        // token expiry proves runtime is newer, OR the refresh token rotated
        // and runtime is not provably older. A rotated refresh token with
        // equal/missing expiry is a genuine CLI refresh we'd otherwise drop
        // (stranding a stale managed token); but if expiry proves runtime is
        // older, managed already holds the newer token (e.g. a prior read-back
        // or proactive refresh), so reject it.
        if (this.lastWrittenCredentialsJson === null) {
          const fresher = this.runtimeCredentialsAreFresher(
            runtimeContents.credentialsJson,
            match.managedCredentialsJson
          )
          const refreshTokenRotated =
            this.compareRefreshTokens(
              runtimeContents.credentialsJson,
              match.managedCredentialsJson
            ) === 'different'
          const older = this.runtimeCredentialsAreOlder(
            runtimeContents.credentialsJson,
            match.managedCredentialsJson
          )
          if (!fresher && !(refreshTokenRotated && !older)) {
            continue
          }
        } else if (
          this.runtimeCredentialsAreOlder(
            runtimeContents.credentialsJson,
            match.managedCredentialsJson
          )
        ) {
          continue
        }
        acceptedCandidates.push({ credentialsJson: runtimeContents.credentialsJson, match })
      }
      if (acceptedCandidates.length === 0) {
        if (sawAmbiguousCandidate) {
          console.warn('[claude-runtime-auth] Refusing ambiguous Claude auth read-back')
        }
        return {
          status: 'rejected',
          runtimeCredentialsChanged: true,
          hasValidChangedRuntimeCredentials: sawValidChangedCandidate,
          runtimeCredentialsJson:
            ambiguousCandidates.length === 1 ? ambiguousCandidates[0] : undefined
        }
      }
      const { credentialsJson: runtimeContents, match } =
        this.chooseFreshestReadBackCandidate(acceptedCandidates)

      await this.writeManagedCredentials(match.account, runtimeContents)
      if (options.updateLastWrittenCredentialsJson) {
        this.writeRuntimeCredentials(runtimeContents)
        this.lastWrittenCredentialsJson = runtimeContents
        if (process.platform === 'darwin') {
          const paths = this.pathResolver.getRuntimePaths()
          await writeActiveClaudeKeychainCredentialsForRuntime(runtimeContents, paths.configDir)
        }
      }
      return { status: 'persisted' }
    } catch (error) {
      // Why: read-back is best-effort. A transient fs error must not block the
      // forward sync path — the worst case is one more stale-token cycle, which
      // is strictly better than failing the entire sync.
      console.warn('[claude-runtime-auth] Failed to read back refreshed tokens:', error)
      return {
        status: 'rejected',
        runtimeCredentialsChanged:
          this.runtimeCredentialsChangedSinceLastWrite(baselineCredentialsJson),
        // Why: an fs error hides whether a live session's refresh is present,
        // so err toward preserving runtime state like before.
        hasValidChangedRuntimeCredentials: true
      }
    }
  }

  protected async readRuntimeCredentialCandidatesForReadBack(
    baselineCredentialsJson: string
  ): Promise<ClaudeRuntimeCredentialCandidate[]> {
    const paths = this.pathResolver.getRuntimePaths()
    const fileCredentials = existsSync(paths.credentialsPath)
      ? readFileSync(paths.credentialsPath, 'utf-8')
      : null
    const runtimeOauthAccount = this.readRuntimeOauthAccount()
    const candidates: ClaudeRuntimeCredentialCandidate[] = []
    const pushCandidate = (credentialsJson: string | null): void => {
      if (
        credentialsJson &&
        !candidates.some((candidate) => candidate.credentialsJson === credentialsJson)
      ) {
        candidates.push({ credentialsJson, runtimeOauthAccount })
      }
    }
    if (process.platform === 'darwin') {
      const scopedKeychainCredentials = await this.readActiveClaudeKeychainCredentialsBestEffort(
        paths.configDir
      )
      const legacyKeychainCredentials = await this.readActiveClaudeKeychainCredentialsBestEffort()
      if (this.lastWrittenCredentialsJson === null) {
        pushCandidate(scopedKeychainCredentials)
        pushCandidate(legacyKeychainCredentials)
        pushCandidate(fileCredentials)
        return candidates.filter(
          (candidate) => candidate.credentialsJson !== baselineCredentialsJson
        )
      }
      pushCandidate(scopedKeychainCredentials)
      pushCandidate(legacyKeychainCredentials)
    }
    pushCandidate(fileCredentials)
    return candidates
  }
}
