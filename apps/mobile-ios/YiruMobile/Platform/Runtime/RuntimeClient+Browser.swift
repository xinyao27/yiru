import Foundation

extension RuntimeClient: WorkspaceBrowserRepository {
    func browserEvents(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        configuration: WorkspaceBrowserStreamConfiguration
    ) async throws -> AsyncThrowingStream<WorkspaceBrowserEvent, Error> {
        let scale = min(max(configuration.scale, 1), 2.5)
        let isMobile = configuration.viewMode == .mobile
        let subscription = try await subscribeRuntimeWithBinary(
            hostID: hostID,
            path: MobileSessionTabsWireContract.browserScreencastSubscribePath,
            input: MobileBrowserScreencastRequestWire(
                worktree: browserWorktreeSelector(worktreeID),
                page: pageID,
                format: "jpeg",
                quality: 72,
                maxWidth: min(max(Int(Double(configuration.width) * scale), 320), 2_400),
                maxHeight: min(max(Int(Double(configuration.height) * scale), 240), 2_160),
                viewportWidth: isMobile ? configuration.width : nil,
                viewportHeight: isMobile ? configuration.height : nil,
                deviceScaleFactor: isMobile ? 2 : nil,
                mobile: isMobile ? true : nil,
                everyNthFrame: 1,
                minFrameIntervalMs: 100
            ),
            output: MobileBrowserScreencastEventWire.self
        )
        let (stream, continuation) = AsyncThrowingStream.makeStream(of: WorkspaceBrowserEvent.self)
        let forwardingTask = Task {
            do {
                try await withThrowingTaskGroup(of: Void.self) { group in
                    group.addTask {
                        for try await event in subscription.events {
                            continuation.yield(Self.mapBrowserEvent(event))
                        }
                    }
                    group.addTask {
                        for try await data in subscription.binary {
                            if let frame = WorkspaceBrowserFrameDecoder.decode(data) {
                                continuation.yield(.frame(frame))
                            }
                        }
                    }
                    _ = try await group.next()
                    group.cancelAll()
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

    func navigateBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        action: WorkspaceBrowserNavigation
    ) async throws -> String {
        let path =
            switch action {
            case .back: MobileSessionTabsWireContract.browserBackPath
            case .forward: MobileSessionTabsWireContract.browserForwardPath
            case .reload: MobileSessionTabsWireContract.browserReloadPath
            }
        let result: MobileBrowserNavigationResultWire = try await callRuntime(
            hostID: hostID,
            path: path,
            input: browserTarget(worktreeID: worktreeID, pageID: pageID),
            output: MobileBrowserNavigationResultWire.self
        )
        return result.url
    }

    func navigateBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        url: String
    ) async throws -> String {
        let result: MobileBrowserNavigationResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.browserGotoPath,
            input: MobileBrowserGotoRequestWire(
                worktree: browserWorktreeSelector(worktreeID),
                page: pageID,
                url: url
            ),
            output: MobileBrowserNavigationResultWire.self
        )
        return result.url
    }

    func clickBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        point: WorkspaceBrowserPoint,
        button: WorkspaceBrowserButton,
        radius: Double?,
        modifiers: [WorkspaceBrowserPointerModifier]
    ) async throws {
        let target = browserWorktreeSelector(worktreeID)
        do {
            let _: MobileIgnoredResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileSessionTabsWireContract.browserMouseClickPath,
                input: MobileBrowserMouseClickRequestWire(
                    worktree: target,
                    page: pageID,
                    x: point.x,
                    y: point.y,
                    button: button.rawValue,
                    radius: radius,
                    modifiers: modifiers.map(\.rawValue)
                ),
                output: MobileIgnoredResultWire.self
            )
        } catch {
            guard modifiers.isEmpty else { throw error }
            let _: MobileIgnoredResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileSessionTabsWireContract.browserMouseMovePath,
                input: MobileBrowserMouseCoordinatesRequestWire(
                    worktree: target,
                    page: pageID,
                    x: point.x,
                    y: point.y
                ),
                output: MobileIgnoredResultWire.self
            )
            let buttonInput = MobileBrowserMouseButtonRequestWire(
                worktree: target,
                page: pageID,
                button: button.rawValue
            )
            let _: MobileIgnoredResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileSessionTabsWireContract.browserMouseDownPath,
                input: buttonInput,
                output: MobileIgnoredResultWire.self
            )
            let _: MobileIgnoredResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileSessionTabsWireContract.browserMouseUpPath,
                input: buttonInput,
                output: MobileIgnoredResultWire.self
            )
        }
    }

    func scrollBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        point: WorkspaceBrowserPoint,
        deltaX: Double,
        deltaY: Double
    ) async throws {
        let _: MobileIgnoredResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.browserMouseMovePath,
            input: MobileBrowserMouseCoordinatesRequestWire(
                worktree: browserWorktreeSelector(worktreeID),
                page: pageID,
                x: point.x,
                y: point.y
            ),
            output: MobileIgnoredResultWire.self
        )
        let _: MobileIgnoredResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.browserMouseWheelPath,
            input: MobileBrowserMouseWheelRequestWire(
                worktree: browserWorktreeSelector(worktreeID),
                page: pageID,
                dx: deltaX,
                dy: deltaY
            ),
            output: MobileIgnoredResultWire.self
        )
    }

    func pressBrowserKey(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        key: String
    ) async throws {
        let _: MobileIgnoredResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.browserKeypressPath,
            input: MobileBrowserKeypressRequestWire(
                worktree: browserWorktreeSelector(worktreeID),
                page: pageID,
                key: key
            ),
            output: MobileIgnoredResultWire.self
        )
    }

    func insertBrowserText(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        text: String
    ) async throws {
        let _: MobileIgnoredResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.browserKeyboardInsertTextPath,
            input: MobileBrowserKeyboardInsertTextRequestWire(
                worktree: browserWorktreeSelector(worktreeID),
                page: pageID,
                text: text
            ),
            output: MobileIgnoredResultWire.self
        )
    }

    func respondToBrowserDialog(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        accepts: Bool
    ) async throws {
        let path =
            accepts
            ? MobileSessionTabsWireContract.browserDialogAcceptPath
            : MobileSessionTabsWireContract.browserDialogDismissPath
        let _: MobileIgnoredResultWire = try await callRuntime(
            hostID: hostID,
            path: path,
            input: MobileBrowserDialogAcceptRequestWire(
                worktree: browserWorktreeSelector(worktreeID),
                page: pageID,
                text: nil
            ),
            output: MobileIgnoredResultWire.self
        )
    }

    private static func mapBrowserEvent(
        _ event: MobileBrowserScreencastEventWire
    ) -> WorkspaceBrowserEvent {
        switch event {
        case .ready(let value): .ready(url: value.tab.url, title: value.tab.title)
        case .end: .end
        case .dialog(let type, let message):
            .dialog(WorkspaceBrowserDialog(type: type, message: message))
        case .dialogClosed: .dialogClosed
        case .error(let message): .error(message)
        }
    }

    private func browserTarget(worktreeID: String, pageID: String) -> MobileBrowserTargetRequestWire
    {
        MobileBrowserTargetRequestWire(
            worktree: browserWorktreeSelector(worktreeID),
            page: pageID
        )
    }

    private func browserWorktreeSelector(_ worktreeID: String) -> String {
        "id:\(worktreeID)"
    }
}
