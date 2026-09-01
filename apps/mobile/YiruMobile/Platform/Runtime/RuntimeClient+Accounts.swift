extension RuntimeClient: AccountsRepository {
    func accounts(for hostID: String) async throws -> AccountsSnapshot {
        let wire: MobileAccountsSnapshotWire = try await callRuntime(
            hostID: hostID,
            path: MobileAccountsWireContract.listPath,
            input: RuntimeVoidInput(),
            output: MobileAccountsSnapshotWire.self
        )
        return AccountsSnapshot(wire: wire)
    }

    func accountUpdates(for hostID: String) async throws
        -> AsyncThrowingStream<AccountsSnapshot, Error>
    {
        let source = try await subscribeRuntime(
            hostID: hostID,
            path: MobileAccountsWireContract.subscribePath,
            input: RuntimeVoidInput(),
            output: MobileAccountsSubscriptionEventWire.self
        )
        let (stream, continuation) = AsyncThrowingStream.makeStream(of: AccountsSnapshot.self)
        let forwardingTask = Task {
            do {
                for try await event in source {
                    guard event.type != .end else {
                        continuation.finish()
                        return
                    }
                    if let snapshot = event.snapshot {
                        continuation.yield(AccountsSnapshot(wire: snapshot))
                    }
                }
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in forwardingTask.cancel() }
        return stream
    }

    func selectAccount(
        hostID: String,
        provider: AccountProvider,
        accountID: String?
    ) async throws {
        let path: String
        switch provider {
        case .claude:
            path = MobileAccountsWireContract.selectClaudePath
        case .codex:
            path = MobileAccountsWireContract.selectCodexPath
        default:
            throw AccountsRepositoryError.unsupportedProvider
        }
        let _: MobileAccountRosterWire = try await callRuntime(
            hostID: hostID,
            path: path,
            input: MobileAccountsSelectRequestWire(accountId: accountID),
            output: MobileAccountRosterWire.self
        )
    }
}
