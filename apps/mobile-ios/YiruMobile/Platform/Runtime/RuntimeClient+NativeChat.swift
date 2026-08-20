import Foundation

extension RuntimeClient: NativeChatRepository {
    func searchNativeChatFiles(
        for hostID: String,
        worktreeID: String,
        query: String,
        limit: Int
    ) async throws -> [String] {
        do {
            let result: MobileFileListResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileFilesWireContract.searchPathsPath,
                input: MobileFilesPathSearchRequestWire(
                    worktree: "id:\(worktreeID)",
                    query: String(query.prefix(256)),
                    limit: min(max(limit, 1), 32)
                ),
                output: MobileFileListResultWire.self
            )
            return result.files.map(\.relativePath).filter { !$0.isEmpty }
        } catch let error as RuntimeOrpcError where isNativeChatMethodUnavailable(error) {
            throw NativeChatRepositoryError.methodUnavailable
        }
    }

    func listNativeChatFiles(for hostID: String, worktreeID: String) async throws -> [String] {
        let result: MobileFileListResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.fileListPath,
            input: MobileSessionTabsWorktreeRequestWire(worktree: "id:\(worktreeID)"),
            output: MobileFileListResultWire.self
        )
        return result.files.map(\.relativePath).filter { !$0.isEmpty }
    }

    func openNativeChatFile(
        for hostID: String,
        worktreeID: String,
        pathText: String,
        terminalID: String?
    ) async throws {
        let resolved: MobileFilesResolveResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileFilesWireContract.resolveTerminalPathPath,
            input: MobileFilesResolveRequestWire(
                worktree: "id:\(worktreeID)",
                pathText: pathText,
                terminal: terminalID,
                cwd: nil
            ),
            output: MobileFilesResolveResultWire.self
        )
        guard resolved.exists, !resolved.isDirectory else { return }
        let relativePath =
            resolved.openTarget?.kind == "worktree-file"
            ? resolved.openTarget?.relativePath
            : resolved.relativePath
        guard let relativePath, !relativePath.isEmpty else { return }
        let opened: MobileFileOpenResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.fileOpenPath,
            input: MobileFileReadRequestWire(
                worktree: "id:\(worktreeID)",
                relativePath: relativePath
            ),
            output: MobileFileOpenResultWire.self
        )
        guard opened.opened else {
            throw NativeChatRepositoryError.rejected("File could not be opened")
        }
    }

    func uploadNativeChatImage(for hostID: String, data: Data) async throws -> String {
        let content = data.base64EncodedString()
        guard content.count <= MobileClipboardWireContract.maxBase64Characters else {
            throw NativeChatRepositoryError.imageTooLarge
        }
        let uploadID: String
        do {
            let started: MobileClipboardStartUploadResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileClipboardWireContract.startUploadPath,
                input: MobileClipboardStartUploadRequestWire(
                    expectedBase64Length: content.count,
                    connectionId: nil
                ),
                output: MobileClipboardStartUploadResultWire.self
            )
            uploadID = started.uploadId
        } catch let error as RuntimeOrpcError where isNativeChatMethodUnavailable(error) {
            guard content.count <= nativeChatSingleFrameImageLimit else {
                throw NativeChatRepositoryError.methodUnavailable
            }
            return try await callRuntime(
                hostID: hostID,
                path: MobileClipboardWireContract.saveImagePath,
                input: MobileClipboardSaveImageRequestWire(
                    contentBase64: content,
                    connectionId: nil
                ),
                output: String.self
            )
        }

        do {
            var offset = 0
            while offset < content.count {
                let start = content.index(content.startIndex, offsetBy: offset)
                let end = content.index(
                    start,
                    offsetBy: min(
                        MobileClipboardWireContract.chunkBase64Characters,
                        content.count - offset
                    )
                )
                let _: MobileClipboardAppendUploadResultWire = try await callRuntime(
                    hostID: hostID,
                    path: MobileClipboardWireContract.appendUploadPath,
                    input: MobileClipboardAppendUploadRequestWire(
                        uploadId: uploadID,
                        offset: offset,
                        contentBase64: String(content[start..<end])
                    ),
                    output: MobileClipboardAppendUploadResultWire.self
                )
                offset += content.distance(from: start, to: end)
            }
            return try await callRuntime(
                hostID: hostID,
                path: MobileClipboardWireContract.commitUploadPath,
                input: MobileClipboardUploadIDRequestWire(uploadId: uploadID),
                output: String.self
            )
        } catch {
            let _: MobileClipboardAbortResultWire? = try? await callRuntime(
                hostID: hostID,
                path: MobileClipboardWireContract.abortUploadPath,
                input: MobileClipboardUploadIDRequestWire(uploadId: uploadID),
                output: MobileClipboardAbortResultWire.self
            )
            throw error
        }
    }

    func nativeChatUpdates(
        for hostID: String,
        agent: String,
        sessionID: String,
        transcriptPath: String?,
        limit: Int
    ) async throws -> AsyncThrowingStream<NativeChatFrame, Error> {
        let source = try await subscribeRuntime(
            hostID: hostID,
            path: MobileNativeChatWireContract.subscribePath,
            input: nativeChatRequest(
                agent: agent,
                sessionID: sessionID,
                transcriptPath: transcriptPath,
                limit: limit,
                beforeOffset: nil,
                subscriptionID: "ios-\(UUID().uuidString)"
            ),
            output: MobileNativeChatSubscriptionEventWire.self
        )
        let (stream, continuation) = AsyncThrowingStream.makeStream(of: NativeChatFrame.self)
        let task = Task {
            do {
                for try await event in source {
                    let frame = try mapNativeChatFrame(event)
                    continuation.yield(frame)
                    if case .end = frame {
                        continuation.finish()
                        return
                    }
                }
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in task.cancel() }
        return stream
    }

    func readNativeChat(
        for hostID: String,
        agent: String,
        sessionID: String,
        transcriptPath: String?,
        beforeOffset: Int?,
        limit: Int
    ) async throws -> NativeChatPage {
        let result: MobileNativeChatReadResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileNativeChatWireContract.readPath,
            input: nativeChatRequest(
                agent: agent,
                sessionID: sessionID,
                transcriptPath: transcriptPath,
                limit: limit,
                beforeOffset: beforeOffset,
                subscriptionID: nil
            ),
            output: MobileNativeChatReadResultWire.self
        )
        if let error = result.error { throw NativeChatRepositoryError.rejected(error) }
        return NativeChatPage(
            messages: (result.messages ?? []).map(mapNativeChatMessage),
            hasMore: result.hasMore == true,
            beforeOffset: result.beforeOffset
        )
    }
}

nonisolated private let nativeChatSingleFrameImageLimit = 256 * 1_024

nonisolated private func isNativeChatMethodUnavailable(_ error: RuntimeOrpcError) -> Bool {
    error.serverCode == "method_not_found"
}

nonisolated private func nativeChatRequest(
    agent: String,
    sessionID: String,
    transcriptPath: String?,
    limit: Int,
    beforeOffset: Int?,
    subscriptionID: String?
) -> MobileNativeChatSessionRequestWire {
    MobileNativeChatSessionRequestWire(
        agent: agent,
        sessionId: sessionID,
        limit: limit,
        subscriptionId: subscriptionID,
        transcriptPath: transcriptPath,
        beforeOffset: beforeOffset
    )
}

nonisolated private func mapNativeChatFrame(_ wire: MobileNativeChatSubscriptionEventWire) throws
    -> NativeChatFrame
{
    let messages = (wire.messages ?? []).map(mapNativeChatMessage)
    switch wire.type {
    case "snapshot":
        return .snapshot(
            messages: messages,
            hasMore: wire.hasMore == true,
            beforeOffset: wire.beforeOffset,
            error: wire.error
        )
    case "replacement":
        return .replacement(
            messages: messages,
            hasMore: wire.hasMore == true,
            beforeOffset: wire.beforeOffset
        )
    case "appended": return .appended(messages)
    case "end": return .end
    default: throw NativeChatRepositoryError.rejected("Unknown native chat event")
    }
}

nonisolated private func mapNativeChatMessage(_ wire: MobileNativeChatMessageWire)
    -> NativeChatMessage
{
    NativeChatMessage(
        id: wire.id,
        role: NativeChatRole(rawValue: wire.role) ?? .system,
        blocks: wire.blocks.map { block in
            switch block {
            case .text(let text): .text(text)
            case .toolCall(let name, let input, let callID):
                .toolCall(name: name, input: NativeChatValue(wire: input), callID: callID)
            case .toolResult(let output, let isError, let callID, let segments):
                .toolResult(output: output, isError: isError, callID: callID, segments: segments)
            case .image(let path, let url, let alt): .image(path: path, url: url, alt: alt)
            }
        },
        timestamp: wire.timestamp.map { Date(timeIntervalSince1970: $0 / 1_000) },
        source: NativeChatSource(rawValue: wire.source) ?? .scrape,
        turnID: wire.turnId
    )
}
