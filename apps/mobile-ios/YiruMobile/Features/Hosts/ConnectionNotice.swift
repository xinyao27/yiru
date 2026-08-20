import SwiftUI

struct HostConnectionNotice: View {
    let snapshot: RuntimeConnectionSnapshot
    let runtime: any HostConnectionRuntime
    let dismiss: () -> Void
    @State private var isRetrying = false

    var body: some View {
        HStack(spacing: Theme.Spacing.small) {
            statusIndicator

            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(statusTitle)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.foreground)
                    .lineLimit(1)
                Text(verbatim: snapshot.hostName)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if canRetry {
                Button {
                    guard !isRetrying else { return }
                    isRetrying = true
                    Task {
                        await runtime.reconnect(hostID: snapshot.hostID)
                        isRetrying = false
                    }
                } label: {
                    if isRetrying {
                        YiruLoader(size: Theme.Control.inlineIcon)
                    } else {
                        Text("Retry")
                            .font(.system(size: Theme.Typography.metadata))
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.Colors.foreground)
                .appButtonContext(.inline)
                .disabled(isRetrying)
                .accessibilityLabel("Reconnect to desktop")
            }

            Button(action: dismiss) {
                YiruIcon(.x, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(
                        width: Theme.Size.minimumHitTarget,
                        height: Theme.Size.minimumHitTarget
                    )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss connection status")
        }
        .padding(.leading, Theme.Spacing.medium)
        .padding(.trailing, Theme.Spacing.extraSmall)
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .glassEffect(
            .regular,
            in: .rect(cornerRadius: Theme.Radius.control)
        )
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var statusIndicator: some View {
        switch snapshot.phase {
        case .connecting, .reconnecting:
            YiruLoader(size: Theme.Control.inlineIcon)
        case .unreachable:
            Circle()
                .fill(Theme.Colors.attention)
                .frame(
                    width: Theme.Control.statusIndicator,
                    height: Theme.Control.statusIndicator
                )
        case .authenticationFailed:
            YiruIcon(.warning, size: Theme.Control.inlineIcon)
                .foregroundStyle(Theme.Colors.attention)
        case .idle, .connected:
            EmptyView()
        }
    }

    private var statusTitle: LocalizedStringResource {
        switch snapshot.phase {
        case .connecting: "Connecting to desktop"
        case .reconnecting:
            snapshot.isReconnectWarning ? "Can't connect to desktop" : "Reconnecting to desktop"
        case .unreachable: "Desktop unavailable"
        case .authenticationFailed: "Desktop authentication failed"
        case .idle, .connected: "Connected"
        }
    }

    private var canRetry: Bool {
        snapshot.shouldShowRetry
    }
}
