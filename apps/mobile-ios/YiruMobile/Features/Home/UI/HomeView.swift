import SwiftUI

struct HomeView: View {
    @State private var model: HomeModel
    private let showDesignSystemCatalog: () -> Void

    init(runtime: any HomeRuntime, showDesignSystemCatalog: @escaping () -> Void) {
        _model = State(initialValue: HomeModel(runtime: runtime))
        self.showDesignSystemCatalog = showDesignSystemCatalog
    }

    var body: some View {
        ZStack {
            AtmosphereBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: Theme.Spacing.large) {
                    introduction
                    connectionContent
                }
                .frame(maxWidth: Theme.Size.readingWidth, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.page)
                .padding(.vertical, Theme.Spacing.extraLarge)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(Text("Yiru"))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(
                    "Design System", systemImage: "paintpalette", action: showDesignSystemCatalog)
            }
        }
        .task {
            await model.refresh()
        }
        .refreshable {
            await model.refresh()
        }
    }

    private var introduction: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                Label("Native iOS foundation", systemImage: "swift")
                    .font(.title2.weight(.semibold))

                Text(
                    "The iOS 26 app shell, architecture, and Liquid Glass design system are ready for feature-by-feature migration."
                )
                .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var connectionContent: some View {
        switch model.phase {
        case .loading:
            ContentSurface {
                HStack(spacing: Theme.Spacing.medium) {
                    ProgressView()
                    Text("Reading connection state…")
                        .foregroundStyle(.secondary)
                }
            }
        case .loaded(let state):
            ConnectionSummary(state: state)
        }
    }
}

private struct ConnectionSummary: View {
    let state: RuntimeConnectionState

    var body: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                badge
                Text(title)
                    .font(.headline)
                Text(detail)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var badge: some View {
        switch state {
        case .unpaired:
            SemanticBadge("Not paired", systemImage: "link.badge.plus", tint: .orange)
        case .connecting:
            SemanticBadge("Connecting", systemImage: "arrow.trianglehead.2.clockwise", tint: .blue)
        case .connected:
            SemanticBadge("Connected", systemImage: "checkmark.circle.fill", tint: .green)
        case .unavailable:
            SemanticBadge("Unavailable", systemImage: "exclamationmark.triangle.fill", tint: .red)
        }
    }

    private var title: LocalizedStringKey {
        switch state {
        case .unpaired:
            "No paired hosts"
        case .connecting:
            "Connecting to host"
        case .connected(let hostName):
            "Connected to \(hostName)"
        case .unavailable:
            "Host unavailable"
        }
    }

    private var detail: LocalizedStringKey {
        switch state {
        case .unpaired:
            "Pairing and the encrypted relay transport are the next migration slice."
        case .connecting:
            "Yiru is establishing an encrypted runtime connection."
        case .connected:
            "Choose a workspace to continue."
        case .unavailable:
            "Check the selected host and connection diagnostics."
        }
    }
}
