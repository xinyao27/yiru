import SwiftUI

struct DesignSystemCatalogView: View {
    @State private var isConnected = true

    var body: some View {
        ZStack {
            AtmosphereBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: Theme.Spacing.extraLarge) {
                    systemFirstSection
                    semanticSection
                    customGlassSection
                }
                .frame(maxWidth: Theme.Size.readingWidth, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.page)
                .padding(.vertical, Theme.Spacing.extraLarge)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(Text("Design System"))
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button("Search", systemImage: "magnifyingglass") {}
                Button("More", systemImage: "ellipsis") {}
            }
        }
    }

    private var systemFirstSection: some View {
        CatalogSection(
            title: "System components first",
            detail: "Navigation, toolbars, menus, sheets, and buttons receive native Liquid Glass."
        ) {
            GlassActionGroup {
                Button("Refresh", systemImage: "arrow.clockwise") {}
                    .buttonStyle(.glass)

                Button("Start session", systemImage: "play.fill") {}
                    .buttonStyle(.glassProminent)
            }
            .controlSize(.large)
        }
    }

    private var semanticSection: some View {
        CatalogSection(
            title: "Content stays content",
            detail: "Status, code, diff, terminal, and transcript layers stay stable and readable."
        ) {
            ContentSurface {
                VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                    HStack(spacing: Theme.Spacing.small) {
                        SemanticBadge(
                            isConnected ? "Connected" : "Offline",
                            systemImage: isConnected
                                ? "checkmark.circle.fill"
                                : "wifi.slash",
                            tint: isConnected ? .green : .orange
                        )

                        Spacer()

                        Toggle("Connection", isOn: $isConnected)
                            .labelsHidden()
                    }

                    Text("Worktree session")
                        .font(.headline)
                    Text("Ordinary content surfaces never stack custom glass effects.")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var customGlassSection: some View {
        CatalogSection(
            title: "Custom glass is functional",
            detail: "Use it for temporary floating controls or HUDs, not decorative cards."
        ) {
            FloatingGlassSurface {
                Label("Agent is waiting for input", systemImage: "sparkles")
                    .font(.headline)
            }
        }
    }
}

private struct CatalogSection<Content: View>: View {
    let title: LocalizedStringKey
    let detail: LocalizedStringKey
    let content: Content

    init(
        title: LocalizedStringKey,
        detail: LocalizedStringKey,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.detail = detail
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(title)
                    .font(.title3.weight(.semibold))
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            content
        }
    }
}

#Preview {
    NavigationStack {
        DesignSystemCatalogView()
    }
}
