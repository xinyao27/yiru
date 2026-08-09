import Combine
import Foundation

/// SwiftUI-friendly wrapper around the shared permission state; in a non-bundled host, all six properties stay `false` and never update.
@MainActor
public final class PermissionsObserver: ObservableObject {
    public nonisolated let objectWillChange = ObservableObjectPublisher()

    private let state: PermissionStatusModel?
    private var stateSubscription: AnyCancellable?

    public init() {
        state = AskForPermission.sharedCenter()?.statusState
        stateSubscription = state?.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }

    public var accessibility: Bool { status(for: .accessibility) }
    public var screenRecording: Bool { status(for: .screenRecording) }
    public var inputMonitoring: Bool { status(for: .inputMonitoring) }
    public var fullDiskAccess: Bool { status(for: .fullDiskAccess) }
    public var developerTools: Bool { status(for: .developerTools) }
    public var appManagement: Bool { status(for: .appManagement) }

    public func status(for kind: PermissionKind) -> Bool {
        state?.isGranted(kind) ?? false
    }
}

extension AskForPermission {
    /// Emits the current authorization state for `kind` plus every change
    /// until the consumer cancels. Finishes immediately with a single
    /// `false` when `isAvailable` is `false`.
    public static func statusUpdates(for kind: PermissionKind) -> AsyncStream<Bool> {
        AsyncStream { continuation in
            guard let center = AskForPermission.sharedCenter() else {
                continuation.yield(false)
                continuation.finish()
                return
            }
            let publisher = center.statusState.publisher(for: kind)
            let task = Task { @MainActor in
                for await value in publisher.values {
                    continuation.yield(value)
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
